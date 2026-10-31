import commons from '../js/common.js'

function request(action, params = {}) {
  const data = { ...params, action }
  commons.setDataUserId(data)
  if (!data.userId) return Promise.reject(new Error('请先登录'))
  return uniCloud.callFunction({ name: 'work_order_records', data }).then(({ result }) => {
    if (!result || result.code !== 200) throw new Error((result && result.message) || '工单请求失败')
    return result
  })
}

export const getWorkOrderRecords = params => request('list', params)
export const updateWorkOrderRecord = params => request('update', params)
// 经营统计对接入口：与列表使用相同筛选和金额口径。
export const getWorkOrderSummary = params => request('summary', params)
