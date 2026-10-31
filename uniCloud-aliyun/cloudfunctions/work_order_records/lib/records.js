'use strict'

function timestamp(value) {
  if (value === null || value === undefined || value === '') return null
  const result = new Date(value).getTime()
  return Number.isFinite(result) ? result : null
}

function normalize(order, cars, users, goods, now) {
  const car = cars.find(row => row._id === order.carInfoId) || {}
  const person = users.find(row => row._id === (order.responsibleId || order.userId)) || {}
  const startedAt = timestamp(order.time)
  const workStatus = ['pending', 'processing', 'completed'].includes(order.workStatus)
    ? order.workStatus : (Number(order.status) === 2 ? 'completed' : 'processing')
  const completedAt = workStatus === 'completed'
    ? timestamp(order.completedAt || order.updateTime) : null
  const amountCents = goods.filter(row => row.orderId === order._id).reduce((sum, row) => {
    // fee 已是项目行金额，含数量；与现有开单页口径一致，不重复乘 count。
    const fee = Number(row.fee)
    return sum + (Number.isFinite(fee) ? Math.round(fee * 100) : 0)
  }, 0)
  return {
    _id: order._id, carInfoId: order.carInfoId, customerName: car.owner || '客户信息缺失',
    carNumber: car.carNumber || '', responsibleId: person._id || '',
    responsibleName: person.realName || person.username || '未指定', workStatus,
    billingStatus: Number(order.status), startedAt, completedAt,
    elapsedMs: startedAt === null || (workStatus === 'completed' && completedAt === null)
      ? null : Math.max(0, (completedAt === null ? now : completedAt) - startedAt),
    amountCents, amount: amountCents / 100
  }
}

function summarize(records) {
  const summary = { total: records.length, pending: 0, processing: 0, completed: 0, amountCents: 0, elapsedMs: 0 }
  records.forEach(row => {
    summary[row.workStatus]++
    summary.amountCents += row.amountCents
    summary.elapsedMs += row.elapsedMs || 0
  })
  summary.amount = summary.amountCents / 100
  return summary
}

module.exports = { normalize, summarize }
