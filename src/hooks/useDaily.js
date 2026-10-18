// 今日条件 store（PHASE2-CONTRACT §2）。
//
// 分工：所有校验/归一/网络解析都在 src/data/daily.js（纯函数，可 Node 单测）；
// 本文件只负责三件事——读一次、写回、把联网失败变成看得见的中文提示。
//
// 为什么 updatedAt 只在用户改动时打戳：备份 v2 的 daily 合并取「updatedAt 新者」。
// 如果挂载后立刻重写一遍并打新戳，那么一个只是把页面开着没动的旧设备，
// 也会在备份合并时压掉真正更新的那台机器。所以挂载时的写回保持原戳不变。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DAILY_KEY,
  buildForecastUrl,
  buildGeocodingUrl,
  createDaily,
  decodeDaily,
  describeDaily,
  mergeWeatherIntoDaily,
  normalizeDaily,
  parseForecastResponse,
  parseGeocodingResponse,
  readDaily,
  seasonFromTemp,
  touchDaily,
  warmthTarget,
  writeDaily,
} from '../data/daily.js'
import { isStorageAvailable } from '../data/wardrobe.js'

const WEATHER_TIMEOUT_MS = 8000

function loadInitial() {
  const { state, warnings, error } = readDaily()
  if (error) warnings.unshift('读取今日条件失败，已按默认值启动（本次改动仍可在页面内使用）')
  return { state, warnings }
}

/** 带超时的 JSON 请求；任何失败都抛出可读中文错误，交给调用方转成提示。 */
async function fetchJson(url, { timeoutMs = WEATHER_TIMEOUT_MS, signal } = {}) {
  if (typeof fetch !== 'function') throw new Error('当前环境不支持联网请求')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const relay = () => controller.abort()
  if (signal) signal.addEventListener('abort', relay)
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`网络返回 ${response.status}`)
    return await response.json()
  } catch (error) {
    if (error && error.name === 'AbortError') throw new Error('联网超时，请检查网络后重试（也可以直接手填）')
    throw error instanceof Error ? error : new Error(String(error))
  } finally {
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', relay)
  }
}

/**
 * @param {{storage?:object}} [options] 测试场景注入替代存储
 */
export function useDaily(options = {}) {
  const opts = options && typeof options === 'object' ? options : {}
  const storageRef = useRef(opts.storage)
  const initialRef = useRef(null)
  if (initialRef.current === null) initialRef.current = loadInitial()

  const [state, setState] = useState(() => initialRef.current.state)
  const [warnings, setWarnings] = useState(() => initialRef.current.warnings)
  const [saveError, setSaveError] = useState(null)
  const [storageAvailable, setStorageAvailable] = useState(() => {
    try {
      return opts.storage !== undefined ? true : isStorageAvailable()
    } catch (error) {
      console.warn('[useDaily] 探测 localStorage 失败，按不可用处理：', error)
      return false
    }
  })
  const [weatherInfo, setWeatherInfo] = useState({ status: 'idle', message: '', city: '' })

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    const result = writeDaily(storageRef.current, state)
    if (!mountedRef.current) return
    if (!result.ok) {
      setSaveError(result.error ? result.error.message : '浏览器不允许本地存储')
      setStorageAvailable(false)
    } else {
      setSaveError(null)
      setStorageAvailable(true)
    }
  }, [state])

  const note = useCallback((messages) => {
    const list = (messages || []).filter(Boolean)
    if (!list.length) return
    console.warn('[useDaily]', list.join(' / '))
    if (mountedRef.current) setWarnings((prev) => [...list, ...prev].slice(0, 8))
  }, [])

  /** 改字段：归一化 → 打时间戳 → 落盘。校验失败时保留可用的部分并给出提示。 */
  const update = useCallback((patch) => {
    const source = patch && typeof patch === 'object' ? patch : {}
    const { state: normalized, warnings: notes, ok } = normalizeDaily({ ...state, ...source })
    if (!ok) notes.unshift('今日条件不是有效对象，已回退为默认值')
    note(notes)
    const next = touchDaily(normalized)
    setState(next)
    return next
  }, [note, state])

  const reset = useCallback(() => {
    setState(touchDaily(createDaily()))
    setWarnings([])
  }, [])

  const replaceAll = useCallback((raw) => {
    const { state: clean, warnings: notes } = decodeDaily(raw)
    setState(clean)
    setWarnings(notes)
  }, [])

  const dismissWarnings = useCallback(() => setWarnings([]), [])

  /** 手填天气（不联网）：写入 city/temp/condition/wind。 */
  const setWeather = useCallback((patch) => update(patch), [update])

  /**
   * 联网查询：先 geocoding 再 forecast，成功后只覆盖城市与天气三项。
   * 失败返回 { ok:false, message }，绝不改动已有手填值。
   */
  const lookupCity = useCallback(async (cityName, { signal } = {}) => {
    const name = typeof cityName === 'string' ? cityName.trim() : ''
    if (!name) {
      const message = '请先填写城市名，再点联网查询'
      if (mountedRef.current) setWeatherInfo({ status: 'error', message, city: '' })
      return { ok: false, message }
    }
    if (mountedRef.current) setWeatherInfo({ status: 'loading', message: '正在查询城市…', city: name })
    try {
      const geoJson = await fetchJson(buildGeocodingUrl(name), { signal })
      const geo = parseGeocodingResponse(geoJson)
      if (!geo.ok) throw new Error(geo.error || '没有找到这个城市')
      const forecastJson = await fetchJson(buildForecastUrl(geo.latitude, geo.longitude), { signal })
      const forecast = parseForecastResponse(forecastJson)
      if (!forecast.ok) throw new Error(forecast.error || '天气查询失败')
      const merged = mergeWeatherIntoDaily(state, forecast, geo.city || name)
      const next = touchDaily(merged)
      setState(next)
      const message = `已更新：${describeDaily(next)}`
      if (mountedRef.current) setWeatherInfo({ status: 'done', message, city: geo.city || name })
      return { ok: true, message, city: geo.city || name }
    } catch (error) {
      const message = `联网查询失败：${error.message}。已保留你手填的天气。`
      if (mountedRef.current) setWeatherInfo({ status: 'error', message, city: name })
      return { ok: false, message }
    }
  }, [state])

  /** 浏览器定位（只有用户点按钮才会走到这里）。 */
  const lookupLocation = useCallback(async ({ signal } = {}) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      const message = '这个浏览器不支持定位，请手动填写城市'
      if (mountedRef.current) setWeatherInfo({ status: 'error', message, city: '' })
      return { ok: false, message }
    }
    if (mountedRef.current) setWeatherInfo({ status: 'loading', message: '正在获取定位…', city: '' })
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: WEATHER_TIMEOUT_MS, maximumAge: 600000 })
      })
      const { latitude, longitude } = position.coords
      const forecastJson = await fetchJson(buildForecastUrl(latitude, longitude), { signal })
      const forecast = parseForecastResponse(forecastJson)
      if (!forecast.ok) throw new Error(forecast.error || '天气查询失败')
      const next = touchDaily(mergeWeatherIntoDaily(state, forecast, state.city))
      setState(next)
      const message = `已按定位更新：${describeDaily(next)}`
      if (mountedRef.current) setWeatherInfo({ status: 'done', message, city: next.city })
      return { ok: true, message }
    } catch (error) {
      const message = error && error.code === 1
        ? '定位被拒绝，请手动填写城市（不会自动再次请求）'
        : `定位查询失败：${error.message || error}。已保留你手填的天气。`
      if (mountedRef.current) setWeatherInfo({ status: 'error', message, city: '' })
      return { ok: false, message }
    }
  }, [state])

  const clearWeatherMessage = useCallback(() => setWeatherInfo({ status: 'idle', message: '', city: '' }), [])

  const season = useMemo(() => seasonFromTemp(state.temp), [state.temp])
  const targetWarmth = useMemo(() => warmthTarget(state.temp), [state.temp])
  const description = useMemo(() => describeDaily(state), [state])

  const persistence = useMemo(() => ({
    available: storageAvailable,
    degraded: !storageAvailable || !!saveError,
    message: !storageAvailable
      ? '本地存储不可用（隐私模式或浏览器限制）：今天的条件只保留在当前页面，刷新后会丢失。'
      : saveError ? `保存到本地失败：${saveError}。今天的条件只保留在当前页面。` : '',
  }), [saveError, storageAvailable])

  return {
    state, conditions: state, warnings, persistence,
    season, targetWarmth, description, weather: weatherInfo,
    update, setWeather, reset, replaceAll, dismissWarnings, clearWeatherMessage,
    lookupCity, lookupLocation,
    storageKey: DAILY_KEY,
    empty: createDaily,
  }
}
