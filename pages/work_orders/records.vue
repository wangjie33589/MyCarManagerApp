<template>
  <view class="page">
    <view class="intro"><text class="heading">工单记录</text><text class="muted">关联客户与账单，跟进每一笔施工</text></view>
    <view class="search">
      <input v-model="keyword" maxlength="100" placeholder="客户 / 车牌 / 工单号 / 负责人" confirm-type="search" @confirm="search" />
      <button type="primary" size="mini" :disabled="loading" @click="search">查询</button>
    </view>
    <view class="filters">
      <text v-for="tab in tabs" :key="tab.value" :class="['filter', { active: status === tab.value }]" @click="changeStatus(tab.value)">{{ tab.label }}</text>
    </view>
    <view v-if="summary" class="overview">
      <text>查询结果 {{ total }} 单 · 已完成 {{ summary.completed }} 单</text>
      <text class="amount">账单合计 ¥{{ money(summary.amount) }}</text>
    </view>
    <text v-if="asOf" class="muted">数据截至 {{ date(asOf) }}，施工中耗时每分钟更新</text>
    <view v-if="error" class="empty"><text>{{ error }}</text><button size="mini" @click="load(page)">重试</button></view>
    <view v-else-if="loading" class="empty">正在查询工单…</view>
    <view v-else-if="!records.length" class="empty">暂无符合条件的工单</view>
    <view v-else>
      <view v-for="item in records" :key="item._id" class="card">
        <view class="row"><text class="customer">{{ item.customerName }}</text><text :class="['badge', item.workStatus]">{{ statusName(item.workStatus) }}</text></view>
        <text class="muted">工单号 {{ item._id }}</text>
        <view class="row"><text>车牌：{{ item.carNumber || '未填写' }}</text><text>{{ billingName(item.billingStatus) }}</text></view>
        <view class="row">
          <text>负责人：{{ item.responsibleName }}</text>
          <picker :range="employees" range-key="name" @change="assign(item, $event)"><text class="link">设置负责人</text></picker>
        </view>
        <view class="line">开单时间：{{ date(item.startedAt) }}</view>
        <view class="line">完成时间：{{ item.workStatus === 'completed' ? date(item.completedAt) : '尚未完成' }}</view>
        <view class="row costs"><text>已耗时 {{ elapsed(item) }}</text><text class="amount">¥{{ money(item.amount) }}</text></view>
        <view class="actions">
          <picker :range="workTabs" range-key="label" @change="setStatus(item, $event)"><button size="mini" :disabled="saving">更新施工状态</button></picker>
          <button size="mini" @click="openCustomer(item)">客户信息</button>
        </view>
      </view>
      <view class="pagination"><button size="mini" :disabled="page <= 1 || loading" @click="load(page - 1)">上一页</button><text>{{ page }} / {{ Math.max(1, Math.ceil(total / 20)) }}</text><button size="mini" :disabled="page * 20 >= total || loading" @click="load(page + 1)">下一页</button></view>
    </view>
    <text class="footnote">金额为当前消费项目合计，包含备件费用；耗时为开单至完成或当前时间的自然时长。历史已付订单按已完成展示，负责人默认开单人。</text>
  </view>
</template>

<script>
import { getWorkOrderRecords, updateWorkOrderRecord } from '@/common/api/workOrders.js'
const workTabs = [{ value: 'pending', label: '待施工' }, { value: 'processing', label: '施工中' }, { value: 'completed', label: '已完成' }]
export default {
  data() {
    return { keyword: '', appliedKeyword: '', status: '', records: [], employees: [], summary: null, total: 0, page: 1,
      loading: false, saving: false, error: '', asOf: null, now: Date.now(), timer: null, requestId: 0,
      workTabs, tabs: [{ value: '', label: '全部' }, ...workTabs] }
  },
  onShow() {
    this.load(this.page)
    this.timer = setInterval(() => { this.now = Date.now() }, 60000)
  },
  onHide() { this.stopTimer() },
  onUnload() { this.stopTimer(); this.requestId++ },
  onPullDownRefresh() { this.load(1).finally(() => uni.stopPullDownRefresh()) },
  methods: {
    stopTimer() { clearInterval(this.timer); this.timer = null },
    search() { this.appliedKeyword = this.keyword.trim(); this.load(1) },
    changeStatus(value) { this.status = value; this.load(1) },
    async load(page) {
      const id = ++this.requestId
      this.loading = true; this.error = ''
      try {
        const { data } = await getWorkOrderRecords({ keyword: this.appliedKeyword, workStatus: this.status, page, pageSize: 20 })
        if (id !== this.requestId) return
        if (page > 1 && !data.list.length) return this.load(1)
        this.records = data.list; this.total = data.total; this.summary = data.summary
        this.employees = data.employees; this.page = page; this.asOf = data.asOf; this.now = Date.now()
      } catch (err) {
        if (id === this.requestId) { this.error = err.message || '查询失败'; this.records = []; this.summary = null; this.asOf = null }
      } finally { if (id === this.requestId) this.loading = false }
    },
    async save(item, patch) {
      if (this.saving) return
      this.saving = true
      try {
        await updateWorkOrderRecord({ id: item._id, ...patch })
        uni.showToast({ title: '已保存', icon: 'success' })
        await this.load(this.page)
      } catch (err) { uni.showToast({ title: err.message || '保存失败', icon: 'none' }) }
      finally { this.saving = false }
    },
    assign(item, event) {
      const employee = this.employees[Number(event.detail.value)]
      if (employee) this.save(item, { responsibleId: employee._id })
    },
    setStatus(item, event) {
      const selected = this.workTabs[Number(event.detail.value)]
      if (!selected || selected.value === item.workStatus) return
      uni.showModal({ title: '更新施工状态', content: `将工单设为“${selected.label}”？${selected.value === 'completed' ? '完成时间将记录为当前时间。' : '完成时间将清空，并继续计算耗时。'}`,
        success: result => { if (result.confirm) this.save(item, { workStatus: selected.value }) } })
    },
    openCustomer(item) {
      if (!item.carInfoId) return uni.showToast({ title: '客户关联信息缺失', icon: 'none' })
      uni.navigateTo({ url: '/pages/car_info/detail?id=' + encodeURIComponent(item.carInfoId) })
    },
    statusName(value) { return (workTabs.find(item => item.value === value) || {}).label || '未知' },
    billingName(value) { return ['临时订单', '挂账订单', '已付订单'][value] || '未知账单状态' },
    money(value) { return Number(value || 0).toFixed(2) },
    date(value) {
      if (value === null || value === undefined) return '未记录'
      const d = new Date(value), pad = n => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    },
    elapsed(item) {
      if (item.elapsedMs === null) return '未记录'
      const delta = item.workStatus === 'completed' ? 0 : Math.max(0, this.now - this.asOf)
      const minutes = Math.floor((item.elapsedMs + delta) / 60000)
      return `${Math.floor(minutes / 1440)}天${Math.floor(minutes % 1440 / 60)}小时${minutes % 60}分钟`
    }
  }
}
</script>

<style scoped>
.page { padding: 28rpx; background: #f4f8fb; min-height: 100vh; color: #283449; box-sizing: border-box; }
.intro { display: flex; flex-direction: column; margin: 12rpx 0 28rpx; gap: 12rpx; }
.heading { font-size: 40rpx; font-weight: bold; }
.muted, .footnote { color: #788599; font-size: 24rpx; overflow-wrap: anywhere; }
.search, .row, .filters, .pagination, .actions { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
.search { padding: 20rpx; background: white; border-radius: 16rpx; }
.search input { flex: 1; min-width: 0; font-size: 26rpx; }
.search button { margin: 0; background: #487fe8; flex-shrink: 0; }
.filters { margin: 28rpx 0; }
.filter { padding: 14rpx 22rpx; border-radius: 32rpx; font-size: 26rpx; background: white; }
.active { background: #487fe8; color: white; }
.overview { display: flex; flex-direction: column; gap: 14rpx; margin-bottom: 18rpx; }
.amount { color: #326fd5; font-weight: bold; }
.card { margin-top: 24rpx; background: white; border-radius: 20rpx; padding: 26rpx; font-size: 26rpx; }
.card .row { margin: 18rpx 0; flex-wrap: wrap; }
.customer { font-size: 32rpx; font-weight: bold; }
.badge { border-radius: 10rpx; padding: 8rpx 16rpx; background: #fff0d7; color: #926313; }
.completed { background: #e4f7ee; color: #258356; }
.processing { background: #eaf1ff; color: #326fd5; }
.link { color: #326fd5; }
.line { margin-top: 16rpx; color: #69778b; }
.costs { border-top: 1px solid #edf0f5; padding-top: 20rpx; }
.actions { justify-content: flex-end; flex-wrap: wrap; }
.actions button, .pagination button { margin: 0; }
.empty { text-align: center; padding: 70rpx 20rpx; color: #788599; }
.empty button { margin-top: 20rpx; }
.pagination { margin: 28rpx 0; font-size: 26rpx; }
.footnote { display: block; margin: 28rpx 0; line-height: 1.8; }
</style>
