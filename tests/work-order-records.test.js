const { test } = require('node:test')
const assert = require('node:assert/strict')
const { normalize, summarize } = require('../uniCloud-aliyun/cloudfunctions/work_order_records/lib/records')
const now = 10000000
const cars = [{ _id: 'car1', owner: '张先生', carNumber: '沪A12345' }]
const users = [{ _id: 'u1', realName: '李师傅' }, { _id: 'u2', realName: '王师傅' }]
const base = { _id: 'o1', carInfoId: 'car1', userId: 'u1', time: 1000, status: 1 }

test('云函数跨100条查询、搜索、分页、汇总与企业隔离，以及状态更新', async () => {
  const tables = {
    user: [{ _id: 'u1', enterpriseId: 'shop', status: true, realName: '李师傅' }, { _id: 'foreign-user', enterpriseId: 'other', status: true }],
    car_info: [{ ...cars[0], enterpriseId: 'shop' }],
    order: Array.from({ length: 105 }, (_, i) => ({ ...base, _id: `o${String(i).padStart(3, '0')}`, enterpriseId: 'shop' })),
    purchased_goods: Array.from({ length: 105 }, (_, i) => ({ _id: `g${i}`, enterpriseId: 'shop', orderId: `o${String(i).padStart(3, '0')}`, fee: '0.10' }))
  }
  tables.order.push({ ...base, _id: 'foreign', enterpriseId: 'other' })
  const db = {
    collection(name) {
      let filter = {}, offset = 0, size = Infinity, fields = null
      const query = {
        where(value) { filter = value; return query },
        doc(id) { filter = { _id: id }; return query },
        field(value) { fields = value; return query },
        orderBy() { return query },
        skip(value) { offset = value; return query },
        limit(value) { size = value; return query },
        async get() {
          let rows = tables[name].filter(row => Object.entries(filter).every(([key, value]) => row[key] === value)).slice(offset, offset + size)
          if (fields) rows = rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key === '_id' || fields[key])))
          return { data: rows }
        },
        async update(patch) {
          const rows = tables[name].filter(row => Object.entries(filter).every(([key, value]) => row[key] === value))
          rows.forEach(row => Object.assign(row, patch))
          return { updated: rows.length }
        }
      }
      return query
    }
  }
  global.uniCloud = { database: () => db }
  const { main } = require('../uniCloud-aliyun/cloudfunctions/work_order_records')
  try {
    const result = await main({ userId: 'u1', enterpriseId: 'other', page: 6 })
    assert.equal(result.code, 200)
    assert.equal(result.data.total, 105)
    assert.equal(result.data.list.length, 5)
    assert.equal(result.data.summary.amountCents, 1050)
    assert.equal((await main({ userId: 'u1', keyword: '张先生' })).data.total, 105)
    assert.equal((await main({ userId: 'u1', keyword: 'no-match' })).data.total, 0)
    assert.equal((await main({ userId: 'u1', action: 'summary' })).data.summary.total, 105)
    assert.equal((await main({ userId: 'u1', action: 'update', id: 'foreign', workStatus: 'completed' })).code, 404)
    assert.equal((await main({ userId: 'u1', action: 'update', id: 'o000', responsibleId: 'foreign-user' })).code, 400)
    assert.equal((await main({ userId: 'u1', page: -1 })).code, 400)
    assert.equal((await main({})).code, 401)
    assert.equal((await main({ userId: 'u1', action: 'update', id: 'o000', workStatus: 'completed' })).code, 200)
    const completed = tables.order[0].completedAt
    await main({ userId: 'u1', action: 'update', id: 'o000', workStatus: 'completed' })
    assert.equal(tables.order[0].completedAt, completed)
    assert.equal((await main({ userId: 'u1', workStatus: 'completed' })).data.total, 1)
    await main({ userId: 'u1', action: 'update', id: 'o000', workStatus: 'processing' })
    assert.equal(tables.order[0].completedAt, null)
    assert.equal(tables.order[0].status, 1)
  } finally { delete global.uniCloud }
})

test('关联客户及指定负责人，挂账施工继续计时；行金额不重复乘数量', () => {
  const row = normalize({ ...base, responsibleId: 'u2' }, cars, users, [
    { orderId: 'o1', fee: '12.34', count: 3 }, { orderId: 'o1', fee: 0.1 },
    { orderId: 'other', fee: 999 }, { orderId: 'o1', fee: 'invalid' }
  ], now)
  assert.equal(row.customerName, '张先生')
  assert.equal(row.responsibleName, '王师傅')
  assert.equal(row.workStatus, 'processing')
  assert.equal(row.elapsedMs, now - 1000)
  assert.equal(row.amountCents, 1244)
})

test('历史已付工单使用入账时间，显式施工状态优先于账单状态', () => {
  const completed = normalize({ ...base, status: '2', updateTime: 6000 }, cars, users, [], now)
  assert.equal(completed.workStatus, 'completed')
  assert.equal(completed.elapsedMs, 5000)
  const processing = normalize({ ...base, status: 2, workStatus: 'processing', completedAt: null }, cars, users, [], now)
  assert.equal(processing.elapsedMs, now - 1000)
  const stopped = normalize({ ...base, workStatus: 'completed', completedAt: 3000 }, cars, users, [], now)
  assert.equal(stopped.elapsedMs, 2000)
})

test('缺失客户、员工、时间时保留工单，不伪造耗时', () => {
  const row = normalize({ _id: 'missing', status: 2 }, [], [], [], now)
  assert.equal(row.customerName, '客户信息缺失')
  assert.equal(row.responsibleName, '未指定')
  assert.equal(row.elapsedMs, null)
  assert.equal(row.completedAt, null)
})

test('统计覆盖所有状态，使用分累加避免浮点金额误差', () => {
  const records = ['pending', 'processing', 'completed'].map((workStatus, i) =>
    normalize({ ...base, workStatus, completedAt: 5000 }, cars, users, [{ orderId: 'o1', fee: [0.1, 0.2, 10][i] }], now))
  const result = summarize(records)
  assert.deepEqual([result.total, result.pending, result.processing, result.completed], [3, 1, 1, 1])
  assert.equal(result.amountCents, 1030)
  assert.equal(result.amount, 10.3)
})
