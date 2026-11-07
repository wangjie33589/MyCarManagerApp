import commoms from "../js/common.js"
import analyticsConfig from "../js/analytics-config.js"

/**
 * 经营统计模块 · 数据接口层
 *
 * 统一约定：
 *   成功 → resolve({ code: 200, status: 'success', data: {...} })
 *   失败 → reject({ code: <错误码>, status: 'error', message: '<可直接展示给用户的中文>' })
 *
 * 错误码：
 *   400 参数非法        401 未登录/用户不存在     403 未启用/无权限
 *   404 记录不存在      500 服务端异常            -1 云函数无返回
 *   -2  网络/调用异常（云函数未部署、断网、超时等）
 *
 * mock 说明：
 *   本文件只负责「真实云函数调用」。本地 mock 由 common/mock/api.js 提供同名实现，
 *   由 common/api/index.js 的 USE_MOCK 开关统一切换（开关在 common/mock/config.js）。
 *   这样统计页与首页、订单列表共用同一份 mock 数据，不会各造一套。
 */

/** 统一调用云函数并把各种异常归一成可展示的结构 */
function callFunction(name, data) {
	return new Promise((resolve, reject) => {
		if (typeof uniCloud === 'undefined') {
			reject({ code: -2, status: 'error', message: '当前环境不支持 uniCloud 调用' })
			return
		}
		uniCloud.callFunction({
			name: name,
			data: data || {}
		}).then((res) => {
			const result = res && res.result
			if (!result) {
				reject({ code: -1, status: 'error', message: '云函数未返回数据' })
				return
			}
			if (result.code == 200) {
				resolve(result)
			} else {
				reject({
					code: result.code || 500,
					status: 'error',
					message: result.message || '请求失败'
				})
			}
		}).catch((err) => {
			const msg = (err && (err.errMsg || err.message)) || ''
			let friendly = '网络异常，请稍后重试'
			if (msg.indexOf('not found') > -1 || msg.indexOf('FUNCTION_NOT_FOUND') > -1) {
				friendly = '云函数未部署到当前服务空间'
			} else if (msg.indexOf('timeout') > -1 || msg.indexOf('TIME_LIMIT') > -1) {
				friendly = '请求超时，请缩小统计区间后重试'
			}
			reject({ code: -2, status: 'error', message: friendly, raw: msg })
		})
	})
}

/**
 * 经营统计查询（只读）
 *
 * @param {Object} data
 *   range  {Number} 7 | 30 | 90，必填
 *   source {String} 'real' | 'test'，可选，默认取 analyticsConfig.source
 * @returns {Promise} data: { range, startDate, endDate, summary, daily, payTypes }
 */
export const get_analytics_summary = (data) => {
	const payload = Object.assign({}, data || {})

	// 门店由云函数在服务端用 userId 反查，客户端传的 enterpriseId 一律丢弃
	commoms.setDataUserId(payload)
	delete payload.enterpriseId
	payload.source = payload.source || analyticsConfig.source

	return callFunction('analytics_summary', payload)
}

/**
 * 测试数据 CRUD（只操作 analytics_test_* 隔离集合，不碰正式业务表）
 *
 * @param {String} action 'create' | 'list' | 'update' | 'remove' | 'clear' | 'seed'
 * @param {Object} data   各动作参数见 docs/analytics-data-api.md
 */
export const analytics_test_data = (action, data) => {
	const payload = Object.assign({ action: action }, data || {})
	commoms.setDataUserId(payload)
	delete payload.enterpriseId
	return callFunction('analytics_test_data', payload)
}

/** 造测试数据：days 天，每天若干单，含多笔付款与赠送 */
export const seed_analytics_test_data = (days) => {
	return analytics_test_data('seed', { days: Number(days) || 30 })
}

/** 查测试数据（分页） */
export const list_analytics_test_data = (page, pageSize) => {
	return analytics_test_data('list', { page: Number(page) || 1, pageSize: Number(pageSize) || 20 })
}

/** 清空测试数据 */
export const clear_analytics_test_data = () => {
	return analytics_test_data('clear', {})
}

/** 新增一条测试订单（可带多笔付款） */
export const create_analytics_test_data = (order) => {
	return analytics_test_data('create', order || {})
}

/** 修改测试订单状态或时间 */
export const update_analytics_test_data = (id, patch) => {
	return analytics_test_data('update', Object.assign({ _id: id }, patch || {}))
}

/** 删除测试订单（连同其付款记录） */
export const remove_analytics_test_data = (id) => {
	return analytics_test_data('remove', { _id: id })
}
