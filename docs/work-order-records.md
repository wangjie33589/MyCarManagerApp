# 工单记录模块

页面：`pages/work_orders/records.vue`。首页和业务页已添加“工单记录”入口。
现有消费开单产生的全部 order 自动进入查询范围，无须迁移或重复建立工单。

## 页面跳转代码

```js
uni.navigateTo({ url: '/pages/work_orders/records' })
```

## HBuilderX 运行

1. 用 HBuilderX 打开本项目，并关联 uniCloud 阿里云服务空间。当前仓库 manifest.json 实际配置为 Vue2，本模块使用兼容 Vue3 的 Options API；本次未迁移整个项目的启动代码和 Vuex。
2. 右键 `uniCloud-aliyun/database/order.schema.json`，上传数据库 Schema。
3. 右键 `uniCloud-aliyun/cloudfunctions/work_order_records`，上传部署云函数。
4. 使用 HBuilderX 菜单“运行 → 运行到浏览器”做电脑预览，或运行到微信开发者工具验证小程序。登录后在首页进入“工单记录”。
5. 确认查询、空结果、状态筛选、分页、负责人设置、完成和重新施工、客户详情跳转。通过原有开单功能添加消费项目/备件后，返回记录页核对金额。

不依赖新增 npm 包。模块直接调用真实 uniCloud，现有 USE_MOCK 开关不替代工单接口。

## 数据与口径

- order 关联 car_info.owner（客户）、carNumber，关联 user.realName/username（负责人）。负责人未指定时显示开单人。
- 消费金额是同企业 purchased_goods 中同 orderId 的 fee 合计，单位元；fee 是整行金额，包含数量，不能再乘 count。备件出库形成的行已包含在内，不重复计算。这是客户账单金额，非店铺维修成本或实收金额。
- workStatus：pending 待施工、processing 施工中、completed 已完成，与原有 status（0 临时、1 挂账、2 已付）独立。
- 历史记录未设置 workStatus 时，status=2 按已完成并采用 updateTime；其他状态按施工中。历史完成时间或下单时间缺失显示“未记录”。
- completedAt 由云端写入；重新设为待施工/施工中清空它。重复完成不改变原完成时间。workUpdatedAt 为施工状态/负责人最近修改时间，不覆盖财务 updateTime。
- 耗时为开单至完成或查询时刻的自然时间，并非技师实际工时。施工中页面每分钟递增；金额在重新查询、下拉刷新或返回页面时更新。
- 查询支持客户名、车牌、工单 ID、负责人，关键词为不区分大小写的子串。汇总对应所有匹配记录，非当前一页。

## 经营统计预留接口

```js
import { getWorkOrderSummary } from '@/common/api/workOrders.js'
const { data } = await getWorkOrderSummary({ keyword: '', workStatus: '' })
// data: { summary, asOf, version: 1, amountUnit: 'CNY', durationUnit: 'ms' }
// summary: { total, pending, processing, completed, amountCents, amount, elapsedMs }
```

同一云函数 `work_order_records` 提供 action=list/summary/update。list 入参支持 page（默认1）、pageSize（默认20，最大100）、keyword、workStatus；返回 list、total、summary、employees、asOf。update 接受 id，以及 responsibleId/workStatus，完成时间由服务端生成。其他模块可直接复用导出的 getWorkOrderRecords、updateWorkOrderRecord、getWorkOrderSummary。

## 集成边界

沿用项目现有客户端 userId 登录协议，云端反查企业并检查启用状态，查询与修改均限定该企业，负责人必须属于同一企业且启用；返回员工信息不包含密码。项目目前未提供可信 token 会话，userId 本身仍可伪造，正式部署前应统一接入服务端 token 校验，本模块没有新增身份认证体系。

当前适合小组作业数据量：云端按100条分批读取企业数据后关联、筛选、汇总及分页，避免默认查询条数导致漏单；大数据量上线应改为数据库聚合及索引，避免全量扫描。并发编辑采用最后一次保存结果，查询不提供跨集合事务快照。

本地逻辑验证：`node --test tests/work-order-records.test.js`。HBuilderX 运行仍需实际云空间与登录数据。
