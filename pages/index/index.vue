<template>
	<view class="my-content">
		<nav-header type="home"></nav-header>
		<uni-section class="my-section">
			<view class="header">
				<view class="header-left">
					<view>
						<text class="text-color1">今日收入</text>
					</view>
					<view>
						<text class="text-color2">{{payFee}}</text><text class="text-color3">RMB</text>
					</view>
				</view>
				<view class="header-mid">

				</view>
				<view class="header-right">
					<view>
						<text class="text-color1">今日支出</text>
					</view>
					<view>
						<text class="text-color2">0</text><text class="text-color3">RMB</text>
					</view>
				</view>
			</view>
		</uni-section>

		<view class="module-content">
			<home-item v-for="item in dataList" :data="item" @click="clickToDetail(item)"></home-item>
		</view>
		<view class="loginout-btn">
			<button type="primary" style="background:#6EA0F7" @click="loginOut()">退出登录</button>
		</view>
	</view>
</template>

<script>
	import checkUpdate from '@/uni_modules/uni-upgrade-center-app/utils/check-update'
	export default {
		data() {
			return {
				payFee: 0,
				dataList: [{
						id: 0,
						icon: 'icon-bill-text',
						url: "./billing/billingDetail/ChoseCard",
						text: "消费开单"
					}, {
						id: 2,
						icon: 'icon-guazhang',
						url: "./orderList/orderList?status=0",
						text: "临时订单"
					}, {
						id: 3,
						icon: 'icon-jieshuguazhang',
						url: "./orderList/orderList?status=1",
						text: "挂帐订单"
					}, {
						id: 4,
						icon: 'icon-ruzhang',
						url: "./orderList/orderList?status=2",
						text: "入账订单"
					}, {
						id: 9,
						icon: 'icon-qiapian',
						url: "/pages/spare_parts/list",
						text: "备品备件"},{
						id: 10,
						icon: 'icon-xiaofeimingxidan',
						url: "/pages/analytics/analytics",
						text: "经营统计"
					}, {
						id: 11,
						icon: 'icon-bill-text',
						url: '/pages/work_orders/records',
						text: '工单记录'
					}
					// , {
					// 	id: 5,
					// 	icon: 'icon-huiyuanchaxun',
					// 	url: "./orderList/orderList",
					// 	text: "客户快查"
					// }, {
					// 	id: 6,
					// 	icon: 'icon-huiyuan',
					// 	url: "pages/index/orderList/orderList",
					// 	text: "会员开卡"
					// }, {
					// 	id: 7,
					// 	icon: 'icon-huiyuanchongzhi',
					// 	url: "pages/index/billing/billingDetail/billingDetail",
					// 	text: "会员充值"
					// }, {
					// 	id: 8,
					// 	icon: 'icon-baoxian1',
					// 	url: "pages/index/billing/billingDetail/billingDetail",
					// 	text: "保险到期"
					// },
				]
			}
		},
		created() {
			checkUpdate()
			const res = uni.getStorageSync("userInfo")
			if (!res) {
				uni.navigateTo({
					url: "../login/login"
				})
			} else {
				this.getUserStatus(res)
			}
			this.getTodayIncome()
			uni.$once("updateOrderStatus", (data) => {
				this.getTodayIncome()
				console.log(": " + JSON.stringify(data));
			})
		},
		activated() {

		},
		onShow() {
			// 每次首页显示都刷新“今日收入”，避免结束订单返回首页后数字未更新
			if (uni.getStorageSync("userInfo")) {
				this.getTodayIncome()
			}
		},
		methods: {
			clickToDetail(item) {
				uni.navigateTo({
					url: item.url
				})

			},
			getTodayIncome() {
				const that = this
				this.$api.get_order_byDate({
					status: 2,
					startTime: this.$commons.getToDayTimestamp(),
					endTime: this.$commons.getTomorrowTimestamp()
				}).then(res => {
					that.payFee = 0
					const list = (res && res.data) ? res.data : []
					list.forEach(item => {
						const pays = item.pay_infoList || []
						pays.forEach(pay => {
							if (pay.type != 4) {
								that.payFee += parseInt(pay.fee) || 0
							}
						})
					})
				}).catch(err => {
					console.error("获取今日收入失败：", err)
				})
			},
			loginOut() {
				uni.clearStorage();
				uni.navigateTo({
					url: "../login/login"
				})
			},
			getUserStatus(user) {
				this.$api.get_user_status({
						id:user._id
				}).then(res => {
					const userInfo = res.data
					if (userInfo.status == 1) {
						uni.setStorageSync("userInfo", res.data)
						this.$store.dispatch("acUser", res.data)
						this.$store.dispatch("acUserId", res.data._id)
					} else {
						this.loginOut()
					}
				})


			}
		}
	}
</script>

<style lang="scss">
	.my-content {
		background-color: #F4F8FB;

	}

	.container {
		padding: 20px;
		font-size: 20px;
		line-height: 24px;
	}

	.header-left {
		text-align: center;
	}

	.header-mid {
		background: #fff;
		height: 80px;
		width: 1px;
	}

	.header-right {
		text-align: center;
	}

	.module-content {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-wrap: wrap;
		margin-top: 10px;
	}

	.text-color1 {
		color: #fff;
		font-size: 16px;
	}

	.text-color2 {
		color: $uni-text-color-yellow;
		font-size: 24px;
	}

	.text-color3 {
		margin-left: 10px;
		color: #fff;
		font-size: 14px;
	}

	.header {
		background-color: $uni-color-primary;
		height: 130px;
		display: flex;
		align-items: center;
		justify-content: space-around;
		border-radius: 5px;
		margin: 0 20px;
	}

	.my-section {
		border-bottom: 1px solid #E4E7EC;
		background-color: #F4F8FB;
		padding-bottom: 30px;
	}

	.loginout-btn {
		padding: 30px;
		margin-top: 60px;
	}
</style>
