/**
 * 经营统计 · 前端侧口径计算（纯函数）
 *
 * 用途：本地 mock 模式下，从 common/mock/db.js 里的 order / pay_infos 数组直接算指标，
 *      让统计页和首页、订单列表吃同一份数据。
 *
 * ⚠️ 本文件与云函数 `analytics_summary/lib/fold.js` 是**同一套口径的两份实现**：
 *    云函数在服务端跑（uniCloud 目录不能被打进前端包），前端 mock 在本地跑（不能跨目录引云函数），
 *    所以必须各留一份。改动任何一边，必须同步另一边，
 *    并由 `tests/analytics-parity.test.js` 用同一批数据比对两边输出是否完全一致。
 *
 * 口径（与首页「今日收入」一致）：
 *   1. 只统计 status = 2（已入账）的订单
 *   2. 订单 updateTime 落在 [startTime, endTime) 区间内
 *   3. 金额 = 该订单下所有 pay_infos.fee 之和，但 type = 4（赠送）不计入
 *   4. 工单数来自订单本身，不受「有无付款」「一单几笔付款」影响
 *   5. 日期按北京时间自然日分桶，缺失日期补 0
 */

const DAY_MS = 24 * 60 * 60 * 1000
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000
const GIFT_TYPE = 4
const ORDER_STATUS_PAID = 2

const PAY_TYPE_LABELS = {
	1: '微信',
	2: '现金',
	3: '支付宝',
	4: '赠送',
	5: '其他',
	6: '银行卡'
}

function toNumber(value) {
	const n = Number(value)
	return isFinite(n) ? n : 0
}

function round2(value) {
	return Math.round(toNumber(value) * 100) / 100
}

function pad2(n) {
	return n < 10 ? '0' + n : '' + n
}

function dayIndexOf(ms) {
	return Math.floor((Number(ms) + BEIJING_OFFSET_MS) / DAY_MS)
}

function dateOfDayIndex(dayIndex) {
	const d = new Date(dayIndex * DAY_MS)
	return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate())
}

/** 计算统计区间，左闭右开，按北京时间自然日对齐 */
export function resolveRange(range, nowMs) {
	const days = Number(range)
	const now = typeof nowMs === 'number' ? nowMs : Date.now()
	const todayIdx = dayIndexOf(now)
	const firstIdx = todayIdx + 1 - days
	return {
		days: days,
		todayIdx: todayIdx,
		firstIdx: firstIdx,
		startTime: firstIdx * DAY_MS - BEIJING_OFFSET_MS,
		endTime: (todayIdx + 1) * DAY_MS - BEIJING_OFFSET_MS,
		startDate: dateOfDayIndex(firstIdx),
		endDate: dateOfDayIndex(todayIdx)
	}
}

/**
 * 从原始订单 / 付款数组算出统计结果
 *
 * @param {Array} orders 订单数组（含 _id / status / updateTime / enterpriseId）
 * @param {Array} pays   付款数组（含 orderId / fee / type）
 * @param {Number} range 7 | 30 | 90
 * @param {Number} nowMs 当前时间戳，便于测试注入
 */
export function buildAnalyticsResult(orders, pays, range, nowMs) {
	const info = resolveRange(range, nowMs)

	// 付款按订单归组
	const payMap = {}
	const payList = pays || []
	for (let i = 0; i < payList.length; i++) {
		const p = payList[i]
		if (!p || !p.orderId) continue
		if (!payMap[p.orderId]) payMap[p.orderId] = []
		payMap[p.orderId].push(p)
	}

	const dailyMap = {}
	const typeMap = {}
	let giftAmount = 0

	const orderList = orders || []
	for (let i = 0; i < orderList.length; i++) {
		const order = orderList[i]
		if (!order) continue
		if (toNumber(order.status) !== ORDER_STATUS_PAID) continue

		const updateTime = toNumber(order.updateTime)
		if (updateTime < info.startTime || updateTime >= info.endTime) continue

		const day = dayIndexOf(updateTime)
		if (!dailyMap[day]) dailyMap[day] = { amount: 0, orders: 0 }
		dailyMap[day].orders += 1

		const orderPays = payMap[order._id] || []
		for (let j = 0; j < orderPays.length; j++) {
			const pay = orderPays[j]
			const type = toNumber(pay.type)
			const fee = toNumber(pay.fee)

			if (!typeMap[type]) {
				typeMap[type] = {
					type: type,
					label: PAY_TYPE_LABELS[type] || ('未知类型(' + type + ')'),
					amount: 0,
					count: 0
				}
			}
			typeMap[type].count += 1
			typeMap[type].amount += fee

			if (type === GIFT_TYPE) {
				giftAmount += fee
				continue
			}
			dailyMap[day].amount += fee
		}
	}

	// 补齐区间内每一天
	const daily = []
	let totalAmount = 0
	let totalOrders = 0
	for (let k = 0; k < info.days; k++) {
		const idx = info.firstIdx + k
		const cell = dailyMap[idx] || { amount: 0, orders: 0 }
		daily.push({
			date: dateOfDayIndex(idx),
			amount: round2(cell.amount),
			orders: cell.orders
		})
		totalAmount += cell.amount
		totalOrders += cell.orders
	}

	// 收款方式分布
	const payTypes = []
	for (const key in typeMap) {
		if (!Object.prototype.hasOwnProperty.call(typeMap, key)) continue
		const t = typeMap[key]
		payTypes.push({
			type: t.type,
			label: t.label,
			amount: round2(t.amount),
			count: t.count,
			isGift: t.type === GIFT_TYPE
		})
	}
	payTypes.sort(function (a, b) {
		if (b.amount !== a.amount) return b.amount - a.amount
		return a.type - b.type
	})

	return {
		range: info.days,
		source: 'mock',
		startDate: info.startDate,
		endDate: info.endDate,
		generatedAt: typeof nowMs === 'number' ? nowMs : Date.now(),
		summary: {
			totalAmount: round2(totalAmount),
			totalOrders: totalOrders,
			avgPerOrder: totalOrders > 0 ? round2(totalAmount / totalOrders) : 0,
			giftAmount: round2(giftAmount),
			payTypeCount: payTypes.length
		},
		daily: daily,
		payTypes: payTypes
	}
}

export default {
	resolveRange,
	buildAnalyticsResult
}
