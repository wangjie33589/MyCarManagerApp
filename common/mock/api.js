/**
 * 本地 mock API
 * 与 common/api/index.js 导出的 $api 方法保持一致。
 * 只在开发模式生效，数据保存在 uni.setStorageSync。
 */
import { loadDb, saveDb, resetMockDb, makeId } from './db.js'
import {
	followup_scan,
	followup_generate,
	followup_list,
	followup_mark,
	followup_debug
} from './followup.js'
import * as S from '../utils/schedule.js'
import { buildAnalyticsResult } from '../js/analytics-calc.js'

function clone(value) {
	return JSON.parse(JSON.stringify(value))
}

function ok(data) {
	return Promise.resolve({
		code: 200,
		status: 'success',
		data: data
	})
}

function fail(msg) {
	return Promise.reject({
		code: -1,
		msg: msg || '操作失败',
		errMsg: msg || '操作失败'
	})
}

function currentUser(db) {
	return uni.getStorageSync('userInfo') || (db.user && db.user[0]) || {}
}

function currentEnterpriseId(db) {
	const user = currentUser(db)
	return user.enterpriseId || 'ent_demo_0001'
}

function findById(list, id) {
	return (list || []).find(item => item._id === id)
}

function now() {
	return Date.now()
}

function toInt(value, defaultValue) {
	const n = parseInt(value)
	return isNaN(n) ? (defaultValue || 0) : n
}

/* ---------------- 登录 / 企业 ---------------- */

function login(data) {
	const db = loadDb()
	const account = data.phoneNumber || data.username || ''
	const password = data.password || ''
	const user = db.user.find(item =>
		(item.phoneNumber === account || item.username === account || item.phoneNumber === String(account)) &&
		item.password === password
	)
	if (!user) return fail('手机号或密码错误')
	if (user.status === 0 || user.status === false) return fail('账号已被禁用')
	return ok(clone(user))
}

function get_enterprise(data) {
	const db = loadDb()
	const enterprise = findById(db.enterprise, data.enterpriseId) || db.enterprise[0]
	return ok(clone(enterprise || {}))
}

function get_user_status(data) {
	const db = loadDb()
	const user = findById(db.user, data.id) || currentUser(db)
	return ok(clone(user || {}))
}

/* ---------------- 车辆 ---------------- */

function get_car_info_byId(data) {
	const db = loadDb()
	const car = findById(db.car_info, data.carInfoId || data.id)
	return ok(clone(car || {}))
}

function get_car_info_by_carNumber(data) {
	const db = loadDb()
	const number = String(data.carNumber || '').trim()
	const car = db.car_info.find(item => item.carNumber === number)
	return ok(clone(car || {}))
}

function get_car_info_list(data) {
	const db = loadDb()
	const enterpriseId = data.enterpriseId || currentEnterpriseId(db)
	const keyword = String(data.keyword || '').trim().toLowerCase()
	let list = db.car_info.filter(item => item.enterpriseId === enterpriseId)
	if (keyword) {
		list = list.filter(item =>
			String(item.carNumber || '').toLowerCase().indexOf(keyword) > -1 ||
			String(item.owner || '').toLowerCase().indexOf(keyword) > -1 ||
			String(item.ownerphone || '').toLowerCase().indexOf(keyword) > -1
		)
	}
	return ok(clone(list))
}

function addcar(data) {
	const db = loadDb()
	const user = currentUser(db)
	const car = {
		_id: makeId('car'),
		userId: user._id || 'user_demo_0001',
		enterpriseId: user.enterpriseId || currentEnterpriseId(db),
		carNumber: data.carNumber || '',
		owner: data.owner || '',
		ownerphone: data.ownerphone || '',
		carType: data.carType || data.type || '',
		brand: data.brand || '',
		engineNumber: data.engineNumber || '',
		frame: data.frame || '',
		insure: data.insure || null,
		other: data.other || ''
	}
	db.car_info.push(car)
	saveDb(db)
	return ok({ id: car._id })
}

function update_car_info(data) {
	const db = loadDb()
	const car = findById(db.car_info, data._id)
	if (!car) return fail('车辆不存在')
	;['carNumber', 'owner', 'ownerphone', 'carType', 'brand', 'engineNumber', 'frame', 'insure', 'other'].forEach(key => {
		if (data[key] !== undefined) car[key] = data[key]
	})
	saveDb(db)
	return ok(clone(car))
}

function delete_car_info(data) {
	const db = loadDb()
	const index = db.car_info.findIndex(item => item._id === data._id)
	if (index < 0) return fail('车辆不存在')
	db.car_info.splice(index, 1)
	saveDb(db)
	return ok({ id: data._id })
}

/* ---------------- 订单 ---------------- */

function addOrder(data) {
	const db = loadDb()
	const user = currentUser(db)
	const order = {
		_id: makeId('order'),
		userId: user._id || 'user_demo_0001',
		enterpriseId: user.enterpriseId || currentEnterpriseId(db),
		carInfoId: data.id || data.carInfoId,
		time: now(),
		status: 0,
		updateTime: now()
	}
	db.order.push(order)
	saveDb(db)
	return ok({ id: order._id })
}

function get_order_byId(data) {
	const db = loadDb()
	const order = findById(db.order, data.id || data._id)
	return ok(clone(order || {}))
}

function get_order_byStatus(data) {
	const db = loadDb()
	const enterpriseId = data.enterpriseId || currentEnterpriseId(db)
	const status = toInt(data.status, 0)
	const list = db.order
		.filter(item => item.enterpriseId === enterpriseId && toInt(item.status, 0) === status)
		.map(order => Object.assign({}, order, {
			carInfoList: db.car_info.filter(car => car._id === order.carInfoId),
			purchasedList: db.purchased_goods.filter(goods => goods.orderId === order._id),
			pay_infoList: db.pay_infos.filter(pay => pay.orderId === order._id)
		}))
	return ok(clone(list))
}

function delete_order(data) {
	const db = loadDb()
	const order = findById(db.order, data._id)
	if (!order) return fail('订单不存在')
	order.status = toInt(data.status, order.status)
	order.updateTime = data.updateTime || now()
	saveDb(db)
	return ok(clone(order))
}

function get_order_byDate(data) {
	const db = loadDb()
	const enterpriseId = data.enterpriseId || currentEnterpriseId(db)
	const status = toInt(data.status, 2)
	let start = Number(data.startTime)
	let end = Number(data.endTime)
	if (!start || !end || isNaN(start) || isNaN(end)) {
		const zero = new Date()
		zero.setHours(0, 0, 0, 0)
		start = zero.getTime()
		end = start + 24 * 60 * 60 * 1000
	}
	const list = db.order
		.filter(order => order.enterpriseId === enterpriseId &&
			toInt(order.status, 0) === status &&
			Number(order.updateTime || 0) >= start &&
			Number(order.updateTime || 0) < end)
		.map(order => Object.assign({}, order, {
			pay_infoList: db.pay_infos.filter(pay => pay.orderId === order._id)
		}))
	return ok(clone(list))
}

/* ---------------- 商品 / 消费项目 ---------------- */

function get_hot_goods() {
	const db = loadDb()
	return ok(clone(db.goods.filter(item => item.hotStatus === true)))
}

function get_All_goods(data) {
	const db = loadDb()
	const enterpriseId = data && data.enterpriseId ? data.enterpriseId : currentEnterpriseId(db)
	return ok(clone(db.goods.filter(item => !item.enterpriseId || item.enterpriseId === enterpriseId)))
}

function get_purchased_goods(data) {
	const db = loadDb()
	const list = db.purchased_goods.filter(item => {
		if (data.orderId && item.orderId !== data.orderId) return false
		if (data.carId && item.carId !== data.carId) return false
		if (data.status !== undefined && data.status !== null && data.status !== '' && toInt(item.status, 0) !== toInt(data.status, 0)) return false
		return true
	})
	return ok(clone(list))
}

function add_purchased_goods(data) {
	const db = loadDb()
	const user = currentUser(db)
	const goods = {
		_id: makeId('pg'),
		userId: data.userId || user._id || 'user_demo_0001',
		enterpriseId: data.enterpriseId || user.enterpriseId || currentEnterpriseId(db),
		name: data.name || '',
		fee: toInt(data.fee, 0),
		count: toInt(data.count, 1),
		orderId: data.orderId || '',
		carId: data.carId || '',
		status: data.status === undefined ? 0 : toInt(data.status, 0),
		source: data.source || 'goods',
		partId: data.partId || '',
		spec: data.spec || '',
		unit: data.unit || ''
	}
	db.purchased_goods.push(goods)
	saveDb(db)
	return ok({ id: goods._id })
}

function update_purchased_goods(data) {
	const db = loadDb()
	const goods = findById(db.purchased_goods, data._id)
	if (!goods) return fail('消费项目不存在')
	if (goods.source === 'spare_part') return fail('备件费用请通过“退料”处理')
	if (data.count !== undefined) goods.count = toInt(data.count, goods.count)
	if (data.fee !== undefined) goods.fee = toInt(data.fee, goods.fee)
	saveDb(db)
	return ok(clone(goods))
}

function delete_purchased_goods(data) {
	const db = loadDb()
	const goods = findById(db.purchased_goods, data._id)
	if (!goods) return fail('消费项目不存在')
	if (goods.source === 'spare_part') return fail('备件费用请通过“退料”处理')
	const index = db.purchased_goods.findIndex(item => item._id === data._id)
	db.purchased_goods.splice(index, 1)
	saveDb(db)
	return ok({ id: data._id })
}

/* ---------------- 收款 ---------------- */

function add_pay_info(data) {
	const db = loadDb()
	const user = currentUser(db)
	const pay = {
		_id: makeId('pay'),
		userId: data.userId || user._id || 'user_demo_0001',
		enterpriseId: data.enterpriseId || user.enterpriseId || currentEnterpriseId(db),
		name: data.name || '',
		type: toInt(data.type, 1),
		fee: toInt(data.fee, 0),
		orderId: data.orderId || '',
		carId: data.carId || ''
	}
	db.pay_infos.push(pay)
	saveDb(db)
	return ok({ id: pay._id })
}

function get_pay_info(data) {
	const db = loadDb()
	const list = db.pay_infos.filter(item => {
		if (data.orderId && item.orderId !== data.orderId) return false
		if (data.carId && item.carId !== data.carId) return false
		return true
	})
	return ok(clone(list))
}

function delete_pay_info(data) {
	const db = loadDb()
	const index = db.pay_infos.findIndex(item => item._id === data._id)
	if (index < 0) return fail('收款记录不存在')
	db.pay_infos.splice(index, 1)
	saveDb(db)
	return ok({ id: data._id })
}

/* ---------------- OCR（演示） ---------------- */

function ocrLicensePlate() {
	return ok({ number: '粤A12345', color: '蓝' })
}

/* ---------------- 备品备件 ---------------- */

function generatePartCode(db, enterpriseId) {
	let max = 0
	db.spare_parts
		.filter(item => item.enterpriseId === enterpriseId)
		.forEach(item => {
			const n = parseInt(String(item.code || '').replace(/[^0-9]/g, ''))
			if (!isNaN(n) && n > max) max = n
		})
	return 'SP' + String(max + 1).padStart(4, '0')
}

function get_spare_parts(data) {
	const db = loadDb()
	const enterpriseId = data.enterpriseId || currentEnterpriseId(db)
	const keyword = String(data.keyword || '').trim().toLowerCase()
	const lowStockOnly = data.lowStockOnly === true || data.lowStockOnly === 'true'
	let list = db.spare_parts.filter(item => {
		if (item.enterpriseId !== enterpriseId) return false
		if (!data.includeDisabled && toInt(item.status, 1) !== 1) return false
		if (keyword) {
			const text = [item.code, item.name, item.spec, item.supplier].join(' ').toLowerCase()
			if (text.indexOf(keyword) < 0) return false
		}
		if (lowStockOnly && toInt(item.stock, 0) > toInt(item.safetyStock, 0)) return false
		return true
	})
	list = clone(list).sort((a, b) => {
		const aLow = toInt(a.stock, 0) <= toInt(a.safetyStock, 0) ? 1 : 0
		const bLow = toInt(b.stock, 0) <= toInt(b.safetyStock, 0) ? 1 : 0
		if (aLow !== bLow) return bLow - aLow
		return String(a.code || '').localeCompare(String(b.code || ''))
	})
	return ok(list)
}

function get_spare_part_by_id(data) {
	const db = loadDb()
	const part = findById(db.spare_parts, data.id || data._id)
	if (!part) return fail('备件不存在')
	const logs = db.spare_part_logs
		.filter(log => log.partId === part._id)
		.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
	return Promise.resolve({
		code: 200,
		status: 'success',
		data: clone(part),
		logs: clone(logs)
	})
}

function add_spare_part(data) {
	const db = loadDb()
	const user = currentUser(db)
	const enterpriseId = data.enterpriseId || user.enterpriseId || currentEnterpriseId(db)
	const part = {
		_id: makeId('part'),
		enterpriseId: enterpriseId,
		code: data.code || generatePartCode(db, enterpriseId),
		name: String(data.name || '').trim(),
		spec: data.spec || '',
		unit: data.unit || '个',
		stock: toInt(data.stock, 0),
		safetyStock: toInt(data.safetyStock, 0),
		location: data.location || '',
		supplier: data.supplier || '',
		costPrice: toInt(data.costPrice, 0),
		salePrice: toInt(data.salePrice, 0),
		status: data.status === undefined ? 1 : toInt(data.status, 1),
		createdAt: now(),
		updatedAt: now()
	}
	if (!part.name) return fail('备件名称不能为空')
	db.spare_parts.push(part)
	if (part.stock > 0) {
		db.spare_part_logs.push({
			_id: makeId('log'),
			enterpriseId: enterpriseId,
			partId: part._id,
			partName: part.name,
			type: 'in',
			qty: part.stock,
			beforeStock: 0,
			afterStock: part.stock,
			unitPrice: part.costPrice,
			orderId: '',
			carId: '',
			operatorId: user._id || '',
			operatorName: user.realName || user.username || '管理员',
			remark: '新增备件初始库存',
			createdAt: now()
		})
	}
	saveDb(db)
	return ok(clone(part))
}

function update_spare_part(data) {
	const db = loadDb()
	const part = findById(db.spare_parts, data._id || data.id)
	if (!part) return fail('备件不存在')
	;['name', 'spec', 'unit', 'location', 'supplier'].forEach(key => {
		if (data[key] !== undefined) part[key] = data[key]
	})
	;['safetyStock', 'costPrice', 'salePrice', 'status'].forEach(key => {
		if (data[key] !== undefined) part[key] = toInt(data[key], part[key])
	})
	part.updatedAt = now()
	saveDb(db)
	return ok(clone(part))
}

function delete_spare_part(data) {
	const db = loadDb()
	const part = findById(db.spare_parts, data.id || data._id)
	if (!part) return fail('备件不存在')
	const hasLogs = db.spare_part_logs.some(log => log.partId === part._id)
	if (hasLogs || toInt(part.stock, 0) > 0) {
		part.status = 0
		part.updatedAt = now()
		saveDb(db)
		return ok({ disabled: true, part: clone(part) })
	}
	const index = db.spare_parts.findIndex(item => item._id === part._id)
	db.spare_parts.splice(index, 1)
	saveDb(db)
	return ok({ disabled: false, id: part._id })
}

function stock_in_spare_part(data) {
	const db = loadDb()
	const part = findById(db.spare_parts, data.partId)
	if (!part) return fail('备件不存在')
	const qty = toInt(data.qty, 0)
	if (qty <= 0) return fail('入库数量必须大于 0')
	const beforeStock = toInt(part.stock, 0)
	part.stock = beforeStock + qty
	if (data.unitCost !== undefined && data.unitCost !== '') part.costPrice = toInt(data.unitCost, part.costPrice)
	if (data.supplier) part.supplier = data.supplier
	part.updatedAt = now()
	const user = currentUser(db)
	db.spare_part_logs.push({
		_id: makeId('log'),
		enterpriseId: part.enterpriseId,
		partId: part._id,
		partName: part.name,
		type: 'in',
		qty: qty,
		beforeStock: beforeStock,
		afterStock: part.stock,
		unitPrice: toInt(data.unitCost, part.costPrice),
		orderId: '',
		carId: '',
		operatorId: user._id || '',
		operatorName: user.realName || user.username || '管理员',
		remark: data.remark || '',
		createdAt: now()
	})
	saveDb(db)
	return ok(clone(part))
}

function issue_spare_parts(data) {
	const db = loadDb()
	const order = findById(db.order, data.orderId)
	if (!order) return fail('工单不存在')
	const orderStatus = toInt(order.status, 0)
	if (orderStatus !== 0 && orderStatus !== 1) return fail('只有临时/挂账工单可以添加备件')
	const items = Array.isArray(data.items) ? data.items : []
	if (!items.length) return fail('请选择备件')
	const user = currentUser(db)
	const created = []
	for (let i = 0; i < items.length; i++) {
		const item = items[i]
		const part = findById(db.spare_parts, item.partId)
		if (!part) return fail('备件不存在：' + item.partId)
		const qty = toInt(item.qty, 0)
		if (qty <= 0) return fail('备件数量必须大于 0')
		const beforeStock = toInt(part.stock, 0)
		if (qty > beforeStock) return fail(part.name + ' 库存不足（当前 ' + beforeStock + '）')
		part.stock = beforeStock - qty
		part.updatedAt = now()
		const fee = toInt(part.salePrice, 0) * qty
		const goods = {
			_id: makeId('pg'),
			userId: user._id || 'user_demo_0001',
			enterpriseId: part.enterpriseId,
			name: part.name + (part.spec ? ' ' + part.spec : ''),
			fee: fee,
			count: qty,
			orderId: data.orderId,
			carId: data.carId || order.carInfoId,
			status: 0,
			source: 'spare_part',
			partId: part._id,
			spec: part.spec || '',
			unit: part.unit || ''
		}
		db.purchased_goods.push(goods)
		db.spare_part_logs.push({
			_id: makeId('log'),
			enterpriseId: part.enterpriseId,
			partId: part._id,
			partName: part.name,
			type: 'out',
			qty: qty,
			beforeStock: beforeStock,
			afterStock: part.stock,
			unitPrice: toInt(part.salePrice, 0),
			orderId: data.orderId,
			carId: goods.carId,
			operatorId: user._id || '',
			operatorName: user.realName || user.username || '管理员',
			remark: data.remark || '',
			createdAt: now()
		})
		created.push(goods)
	}
	saveDb(db)
	return ok({ items: clone(created) })
}

function return_spare_part(data) {
	const db = loadDb()
	const goods = findById(db.purchased_goods, data.id || data._id)
	if (!goods) return fail('备件费用行不存在')
	if (goods.source !== 'spare_part') return fail('只有备件费用可以退料')
	const part = findById(db.spare_parts, goods.partId)
	if (!part) return fail('备件档案不存在')
	const qty = toInt(data.qty, 0)
	if (qty <= 0) return fail('退料数量必须大于 0')
	if (qty > toInt(goods.count, 0)) return fail('退料数量不能大于已用数量')
	const beforeStock = toInt(part.stock, 0)
	part.stock = beforeStock + qty
	part.updatedAt = now()
	const goodsCount = toInt(goods.count, 0)
	const unitPrice = goodsCount > 0 ? Math.round(toInt(goods.fee, 0) / goodsCount) : toInt(part.salePrice, 0)
	if (qty === toInt(goods.count, 0)) {
		const index = db.purchased_goods.findIndex(item => item._id === goods._id)
		db.purchased_goods.splice(index, 1)
	} else {
		goods.count = toInt(goods.count, 0) - qty
		goods.fee = Math.max(0, toInt(goods.fee, 0) - unitPrice * qty)
	}
	const user = currentUser(db)
	db.spare_part_logs.push({
		_id: makeId('log'),
		enterpriseId: part.enterpriseId,
		partId: part._id,
		partName: part.name,
		type: 'return',
		qty: qty,
		beforeStock: beforeStock,
		afterStock: part.stock,
		unitPrice: unitPrice,
		orderId: goods.orderId,
		carId: goods.carId,
		operatorId: user._id || '',
		operatorName: user.realName || user.username || '管理员',
		remark: data.remark || '退料',
		createdAt: now()
	})
	saveDb(db)
	return ok({ qty: qty })
}

function adjust_spare_part_stock(data) {
	const db = loadDb()
	const part = findById(db.spare_parts, data.partId)
	if (!part) return fail('备件不存在')
	const actualStock = toInt(data.actualStock, -1)
	if (actualStock < 0) return fail('实际库存不能小于 0')
	const beforeStock = toInt(part.stock, 0)
	const diff = actualStock - beforeStock
	part.stock = actualStock
	part.updatedAt = now()
	const user = currentUser(db)
	db.spare_part_logs.push({
		_id: makeId('log'),
		enterpriseId: part.enterpriseId,
		partId: part._id,
		partName: part.name,
		type: 'adjust',
		qty: diff,
		beforeStock: beforeStock,
		afterStock: actualStock,
		unitPrice: toInt(part.costPrice, 0),
		orderId: '',
		carId: '',
		operatorId: user._id || '',
		operatorName: user.realName || user.username || '管理员',
		remark: data.remark || '盘点调整',
		createdAt: now()
	})
	saveDb(db)
	return ok(clone(part))
}

function get_spare_part_logs(data) {
	const db = loadDb()
	const list = db.spare_part_logs
		.filter(log => {
			if (data.partId && log.partId !== data.partId) return false
			if (data.type && log.type !== data.type) return false
			return true
		})
		.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
	return ok(clone(list))
}

/* ---------------- 会员 ---------------- */

function memberTxId(enterpriseId, key) {
	return 'mt_' + enterpriseId + '_' + String(key).replace(/[^a-zA-Z0-9_-]/g, '')
}

function memberWithCars(db, member) {
	return Object.assign({}, member, {
		cars: db.car_info.filter(car => car.enterpriseId === member.enterpriseId && car.memberId === member._id)
	})
}

function add_member(data) {
	const db = loadDb()
	const enterpriseId = data.enterpriseId || currentEnterpriseId(db)
	const name = String(data.name || '').trim()
	const phone = String(data.phone || '').trim()
	if (!name || !phone) return fail('姓名和手机号不能为空')
	if (db.member.some(item => item.enterpriseId === enterpriseId && item.phone === phone)) {
		return fail('该手机号已开卡')
	}
	let cardNo = String(data.cardNo || '').trim()
	if (cardNo && db.member.some(item => item.enterpriseId === enterpriseId && item.cardNo === cardNo)) {
		return fail('卡号已存在')
	}
	if (!cardNo) cardNo = 'M' + Date.now()
	const user = currentUser(db)
	const member = {
		_id: makeId('member'),
		enterpriseId: enterpriseId,
		cardNo,
		name,
		phone,
		level: String(data.level || '普通会员').trim() || '普通会员',
		balance: 0,
		totalRecharge: 0,
		totalConsume: 0,
		status: 1,
		remark: String(data.remark || '').trim(),
		creatorUserId: user._id || 'user_demo_0001',
		createTime: now(),
		updateTime: now()
	}
	db.member.push(member)
	saveDb(db)
	return ok(clone(member))
}

function get_member(data) {
	const db = loadDb()
	const enterpriseId = data.enterpriseId || currentEnterpriseId(db)
	let member = null
	if (data.memberId) {
		member = findById(db.member, data.memberId)
	} else if (data.phone) {
		member = db.member.find(item => item.enterpriseId === enterpriseId && item.phone === String(data.phone).trim())
	} else if (data.cardNo) {
		member = db.member.find(item => item.enterpriseId === enterpriseId && item.cardNo === String(data.cardNo).trim())
	} else if (data.carNumber) {
		const car = db.car_info.find(item => item.enterpriseId === enterpriseId && item.carNumber === String(data.carNumber).trim())
		if (car && car.memberId) member = findById(db.member, car.memberId)
	}
	if (!member || member.enterpriseId !== enterpriseId) return fail('会员不存在')
	return ok(clone(memberWithCars(db, member)))
}

function list_members(data) {
	const db = loadDb()
	const enterpriseId = data.enterpriseId || currentEnterpriseId(db)
	const keyword = String(data.keyword || '').trim().toLowerCase()
	const page = Math.max(1, parseInt(data.page) || 1)
	const pageSize = Math.min(100, Math.max(1, parseInt(data.pageSize) || 20))
	let list = db.member.filter(item => item.enterpriseId === enterpriseId)
	if (keyword) {
		list = list.filter(item => {
			const text = [item.name, item.phone, item.cardNo].join(' ').toLowerCase()
			return text.indexOf(keyword) > -1
		})
	}
	list = list.slice().sort((a, b) => Number(b.createTime || 0) - Number(a.createTime || 0))
	const total = list.length
	const start = (page - 1) * pageSize
	return ok({
		list: clone(list.slice(start, start + pageSize)),
		total,
		page,
		pageSize
	})
}

function update_member(data) {
	const db = loadDb()
	const enterpriseId = data.enterpriseId || currentEnterpriseId(db)
	const member = findById(db.member, data.memberId)
	if (!member || member.enterpriseId !== enterpriseId) return fail('会员不存在')
	if (data.name !== undefined) {
		const name = String(data.name || '').trim()
		if (!name) return fail('姓名不能为空')
		member.name = name
	}
	if (data.phone !== undefined) {
		const phone = String(data.phone || '').trim()
		if (!phone) return fail('手机号不能为空')
		const dup = db.member.some(item => item.enterpriseId === enterpriseId && item._id !== member._id && item.phone === phone)
		if (dup) return fail('该手机号已被其他会员使用')
		member.phone = phone
	}
	if (data.level !== undefined) member.level = String(data.level || '普通会员').trim() || '普通会员'
	if (data.remark !== undefined) member.remark = String(data.remark || '').trim()
	member.updateTime = now()
	saveDb(db)
	return ok(clone(member))
}

function set_member_status(data) {
	const db = loadDb()
	const enterpriseId = data.enterpriseId || currentEnterpriseId(db)
	const member = findById(db.member, data.memberId)
	if (!member || member.enterpriseId !== enterpriseId) return fail('会员不存在')
	const status = toInt(data.status, -1)
	if (status !== 0 && status !== 1) return fail('状态必须为 0 或 1')
	member.status = status
	member.updateTime = now()
	saveDb(db)
	return ok({ _id: member._id, status })
}

function bind_member_car(data) {
	const db = loadDb()
	const enterpriseId = data.enterpriseId || currentEnterpriseId(db)
	let car = null
	if (data.carId) {
		car = findById(db.car_info, data.carId)
	} else if (data.carNumber) {
		car = db.car_info.find(item => item.enterpriseId === enterpriseId && item.carNumber === String(data.carNumber).trim())
	}
	if (!car || car.enterpriseId !== enterpriseId) return fail('车辆不存在')
	let member = null
	if (data.memberId) {
		member = findById(db.member, data.memberId)
		if (!member || member.enterpriseId !== enterpriseId) return fail('会员不存在')
	}
	car.memberId = data.memberId || ''
	if (data.orderId) {
		const order = findById(db.order, data.orderId)
		if (!order || order.enterpriseId !== enterpriseId) return fail('订单不存在')
		order.memberId = data.memberId || ''
	}
	saveDb(db)
	return ok({ car: clone(car), member: member ? clone(member) : null })
}

function recharge_member(data) {
	const db = loadDb()
	const enterpriseId = data.enterpriseId || currentEnterpriseId(db)
	const member = findById(db.member, data.memberId)
	if (!member || member.enterpriseId !== enterpriseId) return fail('会员不存在')
	if (member.status !== 1) return fail('会员已禁用')
	const amount = toInt(data.amount, 0)
	if (amount <= 0) return fail('充值金额必须是正整数')
	const key = String(data.idempotencyKey || '').trim()
	if (!key) return fail('缺少幂等键')
	const txId = memberTxId(enterpriseId, key)
	const existing = findById(db.member_transactions, txId)
	if (existing) return ok({ duplicated: true, transactionId: txId, balance: member.balance })
	const before = Number(member.balance || 0)
	const after = before + amount
	member.balance = after
	member.totalRecharge = Number(member.totalRecharge || 0) + amount
	member.updateTime = now()
	db.member_transactions.push({
		_id: txId,
		enterpriseId,
		memberId: member._id,
		type: 'recharge',
		amount,
		balanceBefore: before,
		balanceAfter: after,
		payType: toInt(data.payType, 0),
		operatorUserId: (currentUser(db)._id || ''),
		remark: String(data.remark || '').trim(),
		idempotencyKey: key,
		time: now()
	})
	saveDb(db)
	return ok({ balance: after, transactionId: txId })
}

function consume_member_balance(data) {
	const db = loadDb()
	const enterpriseId = data.enterpriseId || currentEnterpriseId(db)
	const member = findById(db.member, data.memberId)
	if (!member || member.enterpriseId !== enterpriseId) return fail('会员不存在')
	if (member.status !== 1) return fail('会员已禁用')
	const amount = toInt(data.amount, 0)
	if (amount <= 0) return fail('支付金额必须是正整数')
	const key = String(data.idempotencyKey || '').trim()
	if (!key) return fail('缺少幂等键')
	const txId = memberTxId(enterpriseId, key)
	const existing = findById(db.member_transactions, txId)
	if (existing) return ok({ duplicated: true, transactionId: txId, balance: member.balance })
	const order = findById(db.order, data.orderId)
	if (!order || order.enterpriseId !== enterpriseId) return fail('订单不存在')
	if (toInt(order.status, 0) === 2) return fail('订单已入账')
	if (order.memberId && order.memberId !== member._id) return fail('订单已绑定其他会员')
	const totalFee = db.purchased_goods
		.filter(item => item.enterpriseId === enterpriseId && item.orderId === order._id)
		.reduce((total, item) => total + toInt(item.fee, 0), 0)
	const payFee = db.pay_infos
		.filter(item => item.enterpriseId === enterpriseId && item.orderId === order._id)
		.reduce((total, item) => total + toInt(item.fee, 0), 0)
	const oweFee = totalFee - payFee
	if (oweFee <= 0) return fail('订单已无未付金额')
	if (amount > oweFee) return fail('支付金额超过未付金额')
	if (Number(member.balance || 0) < amount) return fail('会员余额不足')
	const before = Number(member.balance || 0)
	const after = before - amount
	member.balance = after
	member.totalConsume = Number(member.totalConsume || 0) + amount
	member.updateTime = now()
	const carId = data.carId || order.carInfoId || ''
	const user = currentUser(db)
	db.member_transactions.push({
		_id: txId,
		enterpriseId,
		memberId: member._id,
		type: 'consume',
		amount,
		balanceBefore: before,
		balanceAfter: after,
		payType: 0,
		orderId: order._id,
		carId,
		operatorUserId: user._id || '',
		remark: String(data.remark || '').trim(),
		idempotencyKey: key,
		time: now()
	})
	db.pay_infos.push({
		_id: makeId('pay'),
		userId: user._id || '',
		enterpriseId,
		memberId: member._id,
		name: '会员卡',
		type: 0,
		fee: amount,
		orderId: order._id,
		carId
	})
	if (!order.memberId) order.memberId = member._id
	saveDb(db)
	return ok({ balance: after, transactionId: txId })
}

function get_member_transactions(data) {
	const db = loadDb()
	const enterpriseId = data.enterpriseId || currentEnterpriseId(db)
	const memberId = String(data.memberId || '')
	const page = Math.max(1, parseInt(data.page) || 1)
	const pageSize = Math.min(100, Math.max(1, parseInt(data.pageSize) || 20))
	let list = db.member_transactions.filter(item => item.enterpriseId === enterpriseId && item.memberId === memberId)
	list = list.slice().sort((a, b) => Number(b.time || 0) - Number(a.time || 0))
	const total = list.length
	const start = (page - 1) * pageSize
	return ok({
		list: clone(list.slice(start, start + pageSize)),
		total,
		page,
		pageSize
	})
}

/* ---------------- 预约排班 ---------------- */

const APPT_CONFIG = { slotMinutes: 60, openMinutes: 8 * 60, closeMinutes: 19 * 60, startAlignMinutes: 30, bayCount: 3 }
const APPT_COLORS = ['#6EA0F7', '#7EC8B8', '#F2B36B', '#B9A7F0', '#E58B8B', '#63B3C7', '#D4A373', '#8A94A6']

function apptColor(id) {
	const str = String(id || '')
	let hash = 0
	for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) % 1000003
	return APPT_COLORS[hash % APPT_COLORS.length]
}

function apptTechnicians(db, enterpriseId) {
	const staff = (db.user || []).filter(u =>
		u.enterpriseId === enterpriseId && !(u.status === 0 || u.status === false || u.status === '0')
	)
	const flagged = staff.filter(u => u.canBeTechnician === true)
	return {
		list: (flagged.length ? flagged : staff).map(u => ({
			_id: u._id,
			name: u.realName || u.username || '未命名',
			phone: u.phoneNumber || '',
			canBeTechnician: u.canBeTechnician === true,
			color: apptColor(u._id)
		})),
		hasTechnicianFlag: flagged.length > 0,
		staffCount: staff.length
	}
}

/**
 * 格位计算：本地 mock 扮演服务端，口径与云函数 lib/schedule.js 的 slotSpanOf 一致。
 * 昨天开始、今天还在做的单落在首档；今天干不完的截到末档。
 */
function apptSpan(a, cfg, dayStart) {
	const start = Number(a.startTime)
	const end = S.resolveEndTime(a)
	const spanSlots = Math.max(1, Math.ceil(S.resolveDuration(a) / cfg.slotMinutes))
	const fromMin = (start - dayStart) / 60000
	const toMin = (end - dayStart) / 60000
	const startsBeforeDay = fromMin < cfg.openMinutes
	const endsAfterDay = toMin > cfg.closeMinutes
	const totalSlots = S.buildSlots(cfg).length
	if (!isFinite(toMin) || toMin <= cfg.openMinutes || fromMin >= cfg.closeMinutes) {
		return { startSlot: -1, spanSlots: spanSlots, clippedSpan: 0, visible: false, startsBeforeDay: startsBeforeDay, endsAfterDay: endsAfterDay }
	}
	const startSlot = fromMin <= cfg.openMinutes ? 0 : Math.floor((fromMin - cfg.openMinutes) / cfg.slotMinutes)
	const bounded = Math.max(0, startSlot)
	const endSlotExclusive = Math.min(totalSlots, Math.ceil((Math.min(toMin, cfg.closeMinutes) - cfg.openMinutes) / cfg.slotMinutes))
	return {
		startSlot: bounded,
		spanSlots: spanSlots,
		clippedSpan: Math.max(1, endSlotExclusive - bounded),
		visible: true,
		startsBeforeDay: startsBeforeDay,
		endsAfterDay: endsAfterDay
	}
}

function apptBoardTime(a, dayStart) {
	const prefix = Number(a.startTime) < dayStart ? '昨日 ' : ''
	return prefix + S.timeRangeText(a)
}

/** 逐档统计工位占用，返回峰值与排满的档 */
function apptBayLoad(list, cfg, dayStart) {
	const slots = S.buildSlots(cfg)
	const occupying = (list || []).filter(a => a && S.isOccupying(a.status))
	const load = slots.map(slot => {
		let count = 0
		occupying.forEach(a => {
			const from = (Number(a.startTime) - dayStart) / 60000
			const to = from + S.resolveDuration(a)
			if (from < slot.endMinutes && slot.startMinutes < to) count++
		})
		return count
	})
	let peak = 0
	let peakIndex = -1
	load.forEach((n, i) => {
		if (n > peak) {
			peak = n
			peakIndex = i
		}
	})
	const fullSlots = []
	if (cfg.bayCount > 0) {
		load.forEach((n, i) => {
			if (n >= cfg.bayCount) fullSlots.push(i)
		})
	}
	return {
		bayCount: cfg.bayCount,
		load: load,
		peak: peak,
		peakLabel: peakIndex >= 0 ? slots[peakIndex].rangeText : '',
		fullSlots: fullSlots,
		fullLabels: fullSlots.map(i => slots[i].rangeText)
	}
}

function apptDecorate(list, cfg, conflictIds, dayStart) {
	return list.map(a => {
		const span = apptSpan(a, cfg, dayStart)
		const duration = S.resolveDuration(a)
		return Object.assign({}, a, {
			status: Number(a.status),
			statusText: S.STATUS_TEXT[Number(a.status)] || '未知',
			timeRangeText: S.timeRangeText(a),
			boardTimeText: apptBoardTime(a, dayStart),
			duration: duration,
			bayNo: parseInt(a.bayNo, 10) || 0,
			startSlot: span.startSlot,
			spanSlots: span.spanSlots,
			clippedSpan: span.clippedSpan || 0,
			visible: span.visible,
			startsBeforeDay: !!span.startsBeforeDay,
			endsAfterDay: !!span.endsAfterDay,
			crossDay: S.crossesDay(a),
			hasConflict: conflictIds.indexOf(a._id) > -1,
			technicianColor: apptColor(a.technicianId)
		})
	})
}

/** 与某天有交集的预约 */
function apptOverlapsDay(a, dayStart, dayEnd) {
	const start = Number(a.startTime)
	const end = S.resolveEndTime(a)
	if (isNaN(start) || isNaN(end)) return false
	return start < dayEnd && end > dayStart
}

function get_appointment_board(data) {
	const db = loadDb()
	const enterpriseId = data.enterpriseId || currentEnterpriseId(db)
	const cfg = S.normalizeConfig(APPT_CONFIG)
	const dateKey = data.date || S.todayKey()
	const dayStart = S.dayStartFromKey(dateKey)
	if (isNaN(dayStart)) return fail('日期格式应为 YYYY-MM-DD')
	const dayEnd = dayStart + S.DAY_MS

	const techInfo = apptTechnicians(db, enterpriseId)
	// 跨天预约：昨天开始、今天还在做的单也要取回来
	const appointments = (db.appointment || []).filter(a =>
		a.enterpriseId === enterpriseId && apptOverlapsDay(a, dayStart, dayEnd)
	)

	// 冲突对：同师傅重叠 + 同工位重叠（前端工具包不含冲突对检测，这里就地算）
	const conflictIds = []
	const occupying = appointments.filter(a => S.isOccupying(a.status))
	for (let i = 0; i < occupying.length; i++) {
		for (let j = i + 1; j < occupying.length; j++) {
			const a = occupying[i]
			const b = occupying[j]
			const hit = Number(a.startTime) < S.resolveEndTime(b) && Number(b.startTime) < S.resolveEndTime(a)
			if (!hit) continue
			const sameTech = String(a.technicianId) === String(b.technicianId)
			const bayA = parseInt(a.bayNo, 10) || 0
			const sameBay = bayA > 0 && bayA === (parseInt(b.bayNo, 10) || 0)
			if (!sameTech && !sameBay) continue
			if (conflictIds.indexOf(a._id) < 0) conflictIds.push(a._id)
			if (conflictIds.indexOf(b._id) < 0) conflictIds.push(b._id)
		}
	}

	const decorated = apptDecorate(appointments, cfg, conflictIds, dayStart)
	const filtered = data.technicianId ? decorated.filter(a => a.technicianId === data.technicianId) : decorated

	const summary = {
		total: 0, booked: 0, working: 0, done: 0, cancelled: 0, noShow: 0,
		crossDayCount: 0, occupiedMinutes: 0, conflictCount: conflictIds.length, loadRate: 0
	}
	const winStart = dayStart + cfg.openMinutes * 60000
	const winEnd = dayStart + cfg.closeMinutes * 60000
	appointments.forEach(a => {
		const status = Number(a.status)
		if (status === 3) { summary.cancelled++; return }
		summary.total++
		if (status === 0) summary.booked++
		if (status === 1) summary.working++
		if (status === 2) summary.done++
		if (status === 4) summary.noShow++
		if (S.crossesDay(a)) summary.crossDayCount++
		if (S.isOccupying(status)) {
			// 跨天单只算落在当天的部分
			const from = Math.max(Number(a.startTime), winStart)
			const to = Math.min(S.resolveEndTime(a), winEnd)
			summary.occupiedMinutes += to > from ? Math.round((to - from) / 60000) : 0
		}
	})
	const capacity = techInfo.list.length * (cfg.closeMinutes - cfg.openMinutes)
	summary.loadRate = capacity > 0 ? Math.min(1, summary.occupiedMinutes / capacity) : 0
	summary.conflictPairs = Math.floor(conflictIds.length / 2)
	summary.bayCount = cfg.bayCount

	const bays = apptBayLoad(appointments, cfg, dayStart)
	summary.bayPeak = bays.peak
	summary.bayPeakLabel = bays.peakLabel
	summary.bayFullCount = bays.fullSlots.length
	summary.bayFullLabels = bays.fullLabels

	const goods = (db.goods || []).filter(g => g.enterpriseId === enterpriseId).map(g => ({
		_id: g._id,
		name: g.name,
		fee: parseInt(g.fee, 10) || 0,
		duration: parseInt(g.duration, 10) || cfg.slotMinutes
	}))

	return ok({
		date: dateKey,
		dateLabel: S.shortDateLabel(dateKey),
		dayStart: dayStart,
		dayEnd: dayEnd,
		config: Object.assign({}, cfg, { openLabel: S.hhmm(cfg.openMinutes), closeLabel: S.hhmm(cfg.closeMinutes) }),
		slots: S.buildSlots(cfg),
		technicians: techInfo.list,
		hasTechnicianFlag: techInfo.hasTechnicianFlag,
		staffCount: techInfo.staffCount,
		appointments: filtered,
		goods: goods,
		bays: bays,
		summary: summary
	})
}

function get_appointment_detail(data) {
	const db = loadDb()
	const enterpriseId = data.enterpriseId || currentEnterpriseId(db)
	const appt = findById(db.appointment, data.id)
	if (!appt || appt.enterpriseId !== enterpriseId) return fail('预约不存在')
	const cfg = S.normalizeConfig(APPT_CONFIG)
	const dayStart = S.beijingDayStart(appt.startTime)
	const sameDay = (db.appointment || []).filter(a =>
		a.enterpriseId === enterpriseId && a.technicianId === appt.technicianId &&
		apptOverlapsDay(a, dayStart, dayStart + S.DAY_MS)
	)
	const conflictIds = []
	const decorated = apptDecorate([appt], cfg, conflictIds, dayStart)
	const others = apptDecorate(sameDay.filter(a => a._id !== appt._id), cfg, conflictIds, dayStart)
	const order = appt.orderId ? findById(db.order, appt.orderId) : null
	return ok({
		appointment: decorated[0],
		others: others,
		order: order ? { _id: order._id, status: Number(order.status) } : null,
		bay: {
			bayNo: parseInt(appt.bayNo, 10) || 0,
			bayCount: cfg.bayCount,
			crossDay: S.crossesDay(appt),
			boardTimeText: apptBoardTime(appt, dayStart)
		},
		config: Object.assign({}, cfg, { openLabel: S.hhmm(cfg.openMinutes), closeLabel: S.hhmm(cfg.closeMinutes) })
	})
}

function get_appointment_by_member(data) {
	const db = loadDb()
	const enterpriseId = data.enterpriseId || currentEnterpriseId(db)
	const cfg = S.normalizeConfig(APPT_CONFIG)
	const memberId = String(data.memberId || '')
	if (!memberId) return fail('缺少会员ID')
	const limit = Math.min(50, Math.max(1, parseInt(data.limit, 10) || 10))
	const list = (db.appointment || [])
		.filter(a => a.enterpriseId === enterpriseId && a.memberId === memberId)
		.sort((a, b) => Number(b.startTime) - Number(a.startTime))
		.slice(0, limit)
	const decorated = apptDecorate(list, cfg, [])
	const currentTs = now()
	const isUpcoming = a => (a.status === 0 || a.status === 1) && Number(a.endTime || a.startTime) >= currentTs
	const upcoming = decorated.filter(isUpcoming).sort((a, b) => Number(a.startTime) - Number(b.startTime))
	const upcomingIds = upcoming.map(a => a._id)
	const history = decorated.filter(a => upcomingIds.indexOf(a._id) < 0)
	return ok({ upcoming: upcoming, history: history, total: decorated.length })
}

function save_appointment(data) {
	const db = loadDb()
	const cfg = S.normalizeConfig(APPT_CONFIG)
	const enterpriseId = data.enterpriseId || currentEnterpriseId(db)
	const user = currentUser(db)

	const technicianId = String(data.technicianId || '')
	if (!technicianId) return fail('请选择师傅')
	const tech = findById(db.user, technicianId)
	if (!tech) return fail('所选师傅不存在')

	if (!data.startTime) return fail('请选择预约开始时间')
	const p = S.beijingParts(data.startTime)
	if (!p) return fail('预约时间格式不正确')
	let startTime = Number(data.startTime)
	const remainder = p.minutesOfDay % cfg.startAlignMinutes
	if (remainder !== 0) startTime = startTime - remainder * 60 * 1000

	let duration = parseInt(data.duration, 10)
	if (!duration || duration <= 0) {
		duration = (data.items || []).reduce((sum, it) => sum + (parseInt(it && it.duration, 10) || 0), 0) || cfg.slotMinutes
	}
	if (duration > 24 * 60) return fail('预约时长不能超过 24 小时')

	const car = data.carInfoId ? findById(db.car_info, data.carInfoId) : null
	const customerName = String(data.customerName || (car && car.owner) || '').trim()
	if (!customerName && !data.carInfoId && !data.memberId) return fail('请至少填写客户姓名，或选择会员/车辆')

	const list = (db.appointment || []).filter(a => a.enterpriseId === enterpriseId)
	const conflicts = S.findConflicts(list, { technicianId: technicianId, startTime: startTime, duration: duration, excludeId: data.id })
	if (conflicts.length) {
		return Promise.reject({
			code: 409,
			status: 'error',
			message: '该时段师傅已有预约：' + conflicts.map(c => S.timeRangeText(c) + ' ' + (c.customerName || '客户')).join('、'),
			conflicts: conflicts.map(c => ({ _id: c._id, timeRangeText: S.timeRangeText(c), customerName: c.customerName || '' }))
		})
	}

	// 工位容量：全店维度，与师傅冲突分开判断
	const bayPlan = S.bayPlan(list, {
		startTime: startTime,
		endTime: startTime + duration * 60 * 1000,
		excludeId: data.id
	}, cfg)
	if (bayPlan.full) {
		return Promise.reject({
			code: 409,
			status: 'error',
			message: '该时段 ' + bayPlan.bayCount + ' 个工位都已占用：' +
				bayPlan.items.map(c => S.timeRangeText(c) + ' ' + (c.customerName || '客户')).join('、') + '，请改约其他时间',
			bayFull: true,
			bayCount: bayPlan.bayCount
		})
	}
	let bayNo = 0
	if (bayPlan.limited) {
		const wanted = parseInt(data.bayNo, 10) || 0
		bayNo = bayPlan.freeBays.indexOf(wanted) > -1 ? wanted : bayPlan.suggestedBay
	}

	const items = (Array.isArray(data.items) ? data.items : [])
		.filter(it => it && it.name)
		.map(it => ({
			goodsId: String(it.goodsId || ''),
			name: String(it.name).trim(),
			fee: parseInt(it.fee, 10) || 0,
			duration: parseInt(it.duration, 10) || cfg.slotMinutes
		}))

	const patch = {
		technicianId: technicianId,
		technicianName: tech.realName || tech.username || '未命名',
		memberId: data.memberId || '',
		carInfoId: data.carInfoId || '',
		carNumber: String(data.carNumber || (car && car.carNumber) || '').trim(),
		customerName: customerName,
		customerPhone: String(data.customerPhone || (car && car.ownerphone) || '').trim(),
		items: items,
		startTime: startTime,
		endTime: startTime + duration * 60 * 1000,
		duration: duration,
		bayNo: bayNo,
		remark: String(data.remark || '').trim(),
		updateTime: now()
	}

	let id = data.id
	if (data.id) {
		const target = findById(db.appointment, data.id)
		if (!target) return fail('预约不存在')
		const timeChanged = Number(target.startTime) !== startTime || S.resolveDuration(target) !== duration
		if (target.orderId && timeChanged) return fail('该预约已开单，改时间请先在工单中处理')
		Object.assign(target, patch)
	} else {
		id = makeId('appt')
		db.appointment.push(Object.assign({
			_id: id,
			enterpriseId: enterpriseId,
			status: 0,
			orderId: '',
			createUserId: user._id || '',
			createUserName: user.realName || '',
			createTime: now()
		}, patch))
	}
	saveDb(db)
	return ok({
		_id: id,
		startTime: patch.startTime,
		endTime: patch.endTime,
		duration: duration,
		bayNo: patch.bayNo,
		warnings: []
	})
}

function set_appointment_status(data) {
	const db = loadDb()
	const enterpriseId = data.enterpriseId || currentEnterpriseId(db)
	const target = findById(db.appointment, data.id)
	if (!target || target.enterpriseId !== enterpriseId) return fail('预约不存在')
	const status = parseInt(data.status, 10)
	if ([0, 1, 2, 3, 4].indexOf(status) < 0) return fail('不支持的预约状态')
	if (status === 3 && target.orderId) return fail('该预约已开单，请先在工单中处理后再取消预约')
	target.status = status
	target.updateTime = now()
	if (data.remark) target.remark = String(data.remark).trim()
	saveDb(db)
	return ok({ _id: target._id, status: status, statusText: S.STATUS_TEXT[status] })
}

function appointment_to_order(data) {
	const db = loadDb()
	const enterpriseId = data.enterpriseId || currentEnterpriseId(db)
	const user = currentUser(db)
	const appt = findById(db.appointment, data.id)
	if (!appt || appt.enterpriseId !== enterpriseId) return fail('预约不存在')
	if (Number(appt.status) === 3) return fail('预约已取消，无法开单')
	if (appt.orderId) return ok({ orderId: appt.orderId, existing: true })
	if (!appt.carInfoId) {
		return Promise.reject({ code: 409, status: 'error', message: '该预约还没有关联车辆，请先到「消费开单」选择车辆建单', needCar: true })
	}

	const orderId = makeId('order')
	const time = now()
	db.order.push({
		_id: orderId,
		userId: user._id || '',
		enterpriseId: enterpriseId,
		memberId: appt.memberId || '',
		carInfoId: appt.carInfoId,
		time: time,
		updateTime: time,
		status: 0
	})
	;(appt.items || []).forEach(it => {
		db.purchased_goods.push({
			_id: makeId('pg'),
			userId: user._id || '',
			enterpriseId: enterpriseId,
			name: it.name,
			fee: parseInt(it.fee, 10) || 0,
			count: 1,
			orderId: orderId,
			carId: appt.carInfoId,
			status: 0,
			source: 'goods'
		})
	})
	appt.status = 1
	appt.orderId = orderId
	appt.updateTime = time
	saveDb(db)
	return ok({ orderId: orderId, itemCount: (appt.items || []).length })
}

function set_technician(data) {
	const db = loadDb()
	const enterpriseId = data.enterpriseId || currentEnterpriseId(db)
	const value = data.value !== false
	const ids = Array.isArray(data.userIds) ? data.userIds : []
	let updated = 0
	db.user.forEach(u => {
		if (u.enterpriseId !== enterpriseId) return
		if (ids.length && ids.indexOf(u._id) < 0) return
		u.canBeTechnician = value
		updated++
	})
	saveDb(db)
	return ok({ updated: updated, value: value })
}

/* ---------------- 经营统计 ---------------- */

/**
 * 经营统计（本地 mock 版）
 * 直接读 mock 库里的 order / pay_infos，与首页「今日收入」、订单列表吃同一份数据，
 * 口径与云函数 analytics_summary 保持一致（见 common/js/analytics-calc.js 顶部说明）。
 */
function get_analytics_summary(data) {
	const db = loadDb()
	const enterpriseId = currentEnterpriseId(db)
	const range = toInt(data && data.range, 7)
	if ([7, 30, 90].indexOf(range) < 0) return fail('range 仅支持 7 / 30 / 90')

	const orders = (db.order || []).filter(item => item.enterpriseId === enterpriseId)
	const pays = (db.pay_infos || []).filter(item => item.enterpriseId === enterpriseId)
	const result = buildAnalyticsResult(orders, pays, range, now())
	result.mock = true
	return ok(result)
}

/** 本地 mock 模式不需要造数：数据来自 common/mock/db.js */
function analyticsTestDataUnsupported(data) {
	const action = (data && data.action) || 'unknown'
	return fail('本地 mock 模式下无需造数（action: ' + action + '），数据来自 common/mock/db.js')
}

/* ---------------- 调试辅助 ---------------- */

function resetMockData() {
	const db = resetMockDb()
	return ok({ reset: true, collections: Object.keys(db) })
}

export default {
	login,
	get_enterprise,
	get_user_status,
	get_car_info_byId,
	get_car_info_by_carNumber,
	get_car_info_list,
	addcar,
	update_car_info,
	delete_car_info,
	addOrder,
	get_order_byId,
	get_order_byStatus,
	delete_order,
	get_order_byDate,
	get_hot_goods,
	get_All_goods,
	get_purchased_goods,
	add_purchased_goods,
	update_purchased_goods,
	delete_purchased_goods,
	add_pay_info,
	get_pay_info,
	delete_pay_info,
	ocrLicensePlate,
	get_spare_parts,
	get_spare_part_by_id,
	add_spare_part,
	update_spare_part,
	delete_spare_part,
	stock_in_spare_part,
	issue_spare_parts,
	return_spare_part,
	adjust_spare_part_stock,
	get_spare_part_logs,
	add_member,
	get_member,
	list_members,
	update_member,
	set_member_status,
	bind_member_car,
	recharge_member,
	consume_member_balance,
	get_member_transactions,
	followup_scan,
	followup_generate,
	followup_list,
	followup_mark,
	followup_debug,
	get_appointment_board,
	get_appointment_detail,
	get_appointment_by_member,
	save_appointment,
	set_appointment_status,
	appointment_to_order,
	set_technician,
	get_analytics_summary,
	analytics_test_data: analyticsTestDataUnsupported,
	seed_analytics_test_data: analyticsTestDataUnsupported,
	list_analytics_test_data: analyticsTestDataUnsupported,
	clear_analytics_test_data: analyticsTestDataUnsupported,
	create_analytics_test_data: analyticsTestDataUnsupported,
	update_analytics_test_data: analyticsTestDataUnsupported,
	remove_analytics_test_data: analyticsTestDataUnsupported,
	resetMockData
}
