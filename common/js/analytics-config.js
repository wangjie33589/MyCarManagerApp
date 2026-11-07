/**
 * 经营统计模块 · 真实接口的数据源配置
 *
 * 改这里，不用改业务代码。两个开关含义：
 *
 * useMock
 *   true  → 用本地模拟数据，完全不访问云函数（仅本地调试用，禁止发给线上）
 *   false → 真实调用云函数，读数据库（线上必须为 false）
 *
 * source
 *   'real' → 聚合 order + pay_infos（真实经营数据）
 *   'test' → 聚合 analytics_test_order / analytics_test_pay_info（隔离测试数据）
 *
 * 建议流程：先用 test 源把链路跑通，确认数字对得上，再切 real。
 *
 * 注意：真实调用需要云函数已上传，且开关打开（环境变量或 app_config 集合里的
 *       ANALYTICS_TRUSTED_AUTH = on），否则云函数会返回 403。
 */
export default {
	useMock: false,
	source: 'real'
}
