'use strict'
const db = uniCloud.database()
const { normalize, summarize } = require('./lib/records')
const ok = data => ({ code: 200, status: 'success', data })
const fail = (code, message) => ({ code, status: 'error', message })

// 分批读取，避免数据库默认 limit 导致历史工单、费用漏算。
async function readAll(name, enterpriseId, fields) {
  const rows = []
  for (let offset = 0; ; offset += 100) {
    let query = db.collection(name).where({ enterpriseId }).orderBy('_id', 'asc').skip(offset).limit(100)
    if (fields) query = query.field(fields)
    const result = await query.get()
    rows.push(...result.data)
    if (result.data.length < 100) return rows
  }
}

exports.main = async (event = {}) => {
  try {
    // 沿用项目现有 userId 登录协议；企业由服务端反查，不接受客户端 enterpriseId。
    if (typeof event.userId !== 'string' || !event.userId) return fail(401, '请先登录')
    const found = await db.collection('user').doc(event.userId).field({ enterpriseId: true, status: true }).get()
    const user = found.data[0]
    if (!user || !user.enterpriseId || ![true, 1].includes(user.status)) return fail(403, '账号不可用')
    const enterpriseId = user.enterpriseId
    const action = event.action || 'list'
    if (!['list', 'summary', 'update'].includes(action)) return fail(400, '不支持的操作')

    if (action === 'update') {
      if (typeof event.id !== 'string' || !event.id) return fail(400, '缺少工单 ID')
      const result = await db.collection('order').where({ _id: event.id, enterpriseId }).limit(1).get()
      const order = result.data[0]
      if (!order) return fail(404, '工单不存在')
      const patch = {}
      if (event.responsibleId !== undefined) {
        if (typeof event.responsibleId !== 'string' || !event.responsibleId) return fail(400, '请选择负责人')
        const employee = await db.collection('user').where({ _id: event.responsibleId, enterpriseId }).limit(1).get()
        if (!employee.data[0] || ![true, 1].includes(employee.data[0].status)) return fail(400, '负责人不可用')
        patch.responsibleId = event.responsibleId
      }
      if (event.workStatus !== undefined) {
        if (!['pending', 'processing', 'completed'].includes(event.workStatus)) return fail(400, '施工状态无效')
        patch.workStatus = event.workStatus
        patch.completedAt = event.workStatus === 'completed'
          ? (order.workStatus === 'completed' || (!order.workStatus && Number(order.status) === 2)
            ? order.completedAt || order.updateTime || Date.now() : Date.now()) : null
      }
      if (!Object.keys(patch).length) return fail(400, '没有修改内容')
      patch.workUpdatedAt = Date.now()
      const updated = await db.collection('order').where({ _id: event.id, enterpriseId }).update(patch)
      return ok(updated)
    }

    const page = event.page === undefined ? 1 : Number(event.page)
    const pageSize = event.pageSize === undefined ? 20 : Number(event.pageSize)
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) return fail(400, '分页参数无效')
    if (event.workStatus && !['pending', 'processing', 'completed'].includes(event.workStatus)) return fail(400, '施工状态无效')
    const keyword = String(event.keyword || '').trim().toLowerCase()
    if (keyword.length > 100) return fail(400, '关键词最多100字')
    const [orders, cars, users, goods] = await Promise.all([
      readAll('order', enterpriseId),
      readAll('car_info', enterpriseId, { owner: true, carNumber: true }),
      readAll('user', enterpriseId, { realName: true, username: true, status: true }),
      readAll('purchased_goods', enterpriseId, { orderId: true, fee: true })
    ])
    const asOf = Date.now()
    const records = orders.map(order => normalize(order, cars, users, goods, asOf))
      .filter(row => (!event.workStatus || row.workStatus === event.workStatus) &&
        (!keyword || [row._id, row.customerName, row.carNumber, row.responsibleName].some(value => String(value).toLowerCase().includes(keyword))))
      .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0) || a._id.localeCompare(b._id))
    const summary = summarize(records)
    if (action === 'summary') return ok({ summary, asOf, version: 1, amountUnit: 'CNY', durationUnit: 'ms' })
    return ok({ list: records.slice((page - 1) * pageSize, page * pageSize), total: records.length, page, pageSize,
      summary, asOf, employees: users.filter(row => [true, 1].includes(row.status)).map(row => ({ _id: row._id, name: row.realName || row.username || '未命名员工' })) })
  } catch (error) {
    console.error('[work_order_records]', error)
    return fail(500, '工单操作失败，请检查云函数部署或稍后重试')
  }
}
