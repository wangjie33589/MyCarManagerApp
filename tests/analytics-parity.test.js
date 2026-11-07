'use strict'

/**
 * 经营统计 · 双实现一致性测试
 *
 * 统计口径现在有两份实现：
 *   1. 云函数  uniCloud-aliyun/cloudfunctions/analytics_summary/lib/fold.js（服务端）
 *   2. 前端    common/js/analytics-calc.js（mock 模式用）
 *
 * 两份实现必须给出**完全相同**的结果，否则线上和本地调试会得出不同的数字。
 * 本测试用同一批原始数据跑两边，逐字段比对。
 *
 * 运行：node tests/analytics-parity.test.js
 */

const path = require('path')
const fs = require('fs')
const os = require('os')
const { pathToFileURL } = require('url')

const CF_DIR = path.join(__dirname, '..', 'uniCloud-aliyun', 'cloudfunctions', 'analytics_summary', 'lib')
const { dayIndexOf, resolveRange } = require(path.join(CF_DIR, 'day-bucket.js'))
const { buildResult } = require(path.join(CF_DIR, 'fold.js'))

const CALC_PATH = path.join(__dirname, '..', 'common', 'js', 'analytics-calc.js')

let passed = 0
let failed = 0
const failures = []

function check(name, actual, expected) {
	const a = JSON.stringify(actual)
	const e = JSON.stringify(expected)
	if (a === e) {
		passed++
		console.log('  PASS  ' + name)
	} else {
		failed++
		failures.push(name + '\n        期望: ' + e + '\n        实际: ' + a)
		console.log('  FAIL  ' + name)
		console.log('        期望 ' + e)
		console.log('        实际 ' + a)
	}
}

/**
 * 模拟 MongoDB 聚合管道的输出，喂给云函数的 fold.js
 * - order 管道：match(status=2, updateTime 区间) -> group by day -> sum(1)
 * - pay 管道：从 pay_infos join order -> match 同上 -> group by {day,type} -> push(fee)
 */
function aggregateForCloud(orders, pays, rangeInfo) {
	const payByOrder = {}
	;(pays || []).forEach(p => {
		if (!p || !p.orderId) return
		if (!payByOrder[p.orderId]) payByOrder[p.orderId] = []
		payByOrder[p.orderId].push(p)
	})

	const orderGroups = {}
	const payGroups = {}

	;(orders || []).forEach(order => {
		if (!order) return
		if (Number(order.status) !== 2) return
		const t = Number(order.updateTime)
		if (t < rangeInfo.startTime || t >= rangeInfo.endTime) return

		const day = dayIndexOf(t)
		orderGroups[day] = (orderGroups[day] || 0) + 1

		const list = payByOrder[order._id] || []
		list.forEach(p => {
			const key = day + '|' + Number(p.type)
			if (!payGroups[key]) payGroups[key] = { day: day, type: Number(p.type), fees: [] }
			payGroups[key].fees.push(p.fee)
		})
	})

	const orderRows = Object.keys(orderGroups).map(k => ({ _id: Number(k), orders: orderGroups[k] }))
	const payRows = Object.keys(payGroups).map(k => ({
		_id: { day: payGroups[k].day, type: payGroups[k].type },
		fees: payGroups[k].fees
	}))
	return { orderRows, payRows }
}

function timeAt(daysAgo, hour, minute) {
	const now = new Date()
	const base = new Date(now.getFullYear(), now.getMonth(), now.getDate())
	return base.getTime() - daysAgo * 86400000 + (((hour || 0) * 60) + (minute || 0)) * 60000
}

/** 构造覆盖各类边界的原始数据 */
function buildFixture() {
	const orders = []
	const pays = []
	let seq = 0

	function addOrder(status, updateTime, opts) {
		seq++
		const id = 'o_' + seq
		orders.push({
			_id: id,
			enterpriseId: 'ent_test',
			status: status,
			updateTime: updateTime,
			time: updateTime - 3600000
		})
		const payList = (opts && opts.pays) || []
		payList.forEach(p => {
			pays.push({
				_id: 'p_' + seq + '_' + Math.random().toString(36).slice(2, 6),
				enterpriseId: 'ent_test',
				orderId: id,
				type: p.type,
				fee: p.fee,
				name: 'type' + p.type
			})
		})
		return id
	}

	// 今天：正常单选、多笔拆分、赠送、无付款
	addOrder(2, timeAt(0, 9, 30), { pays: [{ type: 1, fee: 300 }] })
	addOrder(2, timeAt(0, 11, 0), { pays: [{ type: 1, fee: 100 }, { type: 2, fee: 80 }] })
	addOrder(2, timeAt(0, 14, 0), { pays: [{ type: 3, fee: 260 }, { type: 4, fee: 60 }] })
	addOrder(2, timeAt(0, 16, 0), { pays: [] })

	// 昨天：字符串金额 + 银行卡
	addOrder(2, timeAt(1, 10, 0), { pays: [{ type: 6, fee: '150' }] })

	// 3 天前：其他 + 零金额
	addOrder(2, timeAt(3, 15, 0), { pays: [{ type: 5, fee: 0 }] })

	// 未入账 / 挂账 / 已删除：都不该被统计
	addOrder(0, timeAt(0, 10, 0), { pays: [{ type: 1, fee: 999 }] })
	addOrder(1, timeAt(1, 9, 0), { pays: [{ type: 2, fee: 888 }] })
	addOrder(-1, timeAt(2, 9, 0), { pays: [{ type: 1, fee: 777 }] })

	// 边界：今天 00:00:00 应算今天（左闭）
	addOrder(2, timeAt(0, 0, 0), { pays: [{ type: 2, fee: 10 }] })

	// 超出区间：40 天前（7/30 天区间都应排除）
	addOrder(2, timeAt(40, 12, 0), { pays: [{ type: 1, fee: 5000 }] })

	return { orders, pays }
}

/**
 * 项目没有根 package.json，.js 会被 Node 当 CommonJS 解析。
 * 先复制成临时 .mjs 再动态 import，才能按 ESM 解析 export 语法。
 */
async function loadCalcModule() {
	const tmp = path.join(os.tmpdir(), 'analytics-calc-' + process.pid + '.mjs')
	fs.copyFileSync(CALC_PATH, tmp)
	try {
		return await import(pathToFileURL(tmp).href)
	} finally {
		try { fs.unlinkSync(tmp) } catch (e) { /* 忽略清理失败 */ }
	}
}

;(async function main() {
	const calc = await loadCalcModule()
	const fixture = buildFixture()
	const nowMs = Date.now()

	console.log('\n[1] 区间计算一致性')
	for (const days of [7, 30, 90]) {
		const cf = resolveRange(days, nowMs)
		const fe = calc.resolveRange(days, nowMs)
		check(days + ' 天 startDate', fe.startDate, cf.startDate)
		check(days + ' 天 endDate', fe.endDate, cf.endDate)
		check(days + ' 天 startTime', fe.startTime, cf.startTime)
		check(days + ' 天 endTime', fe.endTime, cf.endTime)
	}

	console.log('\n[2] 聚合结果一致性（7 / 30 / 90 天）')
	for (const days of [7, 30, 90]) {
		const info = resolveRange(days, nowMs)
		const { orderRows, payRows } = aggregateForCloud(fixture.orders, fixture.pays, info)
		const cfResult = buildResult(orderRows, payRows, { firstIdx: info.firstIdx, days: days })
		const feResult = calc.buildAnalyticsResult(fixture.orders, fixture.pays, days, nowMs)

		check(days + ' 天 summary', feResult.summary, cfResult.summary)
		check(days + ' 天 daily', feResult.daily, cfResult.daily)
		check(days + ' 天 payTypes', feResult.payTypes, cfResult.payTypes)
	}

	console.log('\n[3] 口径抽查（与业务预期对齐）')
	const r7 = calc.buildAnalyticsResult(fixture.orders, fixture.pays, 7, nowMs)
	// 已入账且在 7 天内：今天 4 单（含 00:00 那单）+ 昨天 1 单 + 3 天前 1 单 + 今天 00:00 单 = 7 单
	check('7 天工单数 = 7', r7.summary.totalOrders, 7)
	// 金额：300 + (100+80) + 260 + 0(无付款) + 150 + 0 + 10 = 900（赠送 60 不计）
	check('7 天金额 = 900（赠送已剔除）', r7.summary.totalAmount, 900)
	check('赠送单独统计 = 60', r7.summary.giftAmount, 60)
	check('平均每单 = 900/7 = 128.57', r7.summary.avgPerOrder, 128.57)
	check('每日条数 = 7', r7.daily.length, 7)

	const r30 = calc.buildAnalyticsResult(fixture.orders, fixture.pays, 30, nowMs)
	check('30 天工单数仍为 7（40 天前的单被排除）', r30.summary.totalOrders, 7)

	// 90 天区间才把 40 天前那单算进来
	const r90 = calc.buildAnalyticsResult(fixture.orders, fixture.pays, 90, nowMs)
	check('90 天工单数 = 8', r90.summary.totalOrders, 8)
	check('90 天金额 = 5900', r90.summary.totalAmount, 5900)

	console.log('\n====================================')
	console.log('通过 ' + passed + ' / ' + (passed + failed))
	if (failed > 0) {
		console.log('\n失败明细：')
		failures.forEach(f => console.log(' - ' + f))
		process.exit(1)
	} else {
		console.log('两份实现结果完全一致')
	}
})().catch(err => {
	console.error(err)
	process.exit(1)
})
