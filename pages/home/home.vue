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
						<text class="text-color2">1485</text><text class="text-color3">RMB</text>
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
	</view>
</template>

<script>
	export default {
		data() {
			return {
				dataList: [{
					id: 11,
					icon: 'icon-bill-text',
					url: '/pages/work_orders/records',
					text: '工单记录'
				}, {
					id: 0,
					icon: 'icon-bill-text',
					url: "./billing/billingDetail/ChoseCard",
					text: "消费开单"
				}, {
					id: 2,
					icon: 'icon-guazhang',
					url: "./orderList/orderList",
					text: "临时订单"
				}, {
					id: 3,
					icon: 'icon-jieshuguazhang',
					url: "./orderList/orderList",
					text: "挂帐订单"
				}, {
					id: 4,
					icon: 'icon-ruzhang',
					url: "./orderList/orderList",
					text: "入账订单"
				}, {
					id: 5,
					icon: 'icon-huiyuanchaxun',
					url: "./orderList/orderList",
					text: "客户快查"
				}, {
					id: 6,
					icon: 'icon-huiyuan',
					url: "pages/index/orderList/orderList",
					text: "会员开卡"
				}, {
					id: 7,
					icon: 'icon-huiyuanchongzhi',
					url: "pages/index/billing/billingDetail/billingDetail",
					text: "会员充值"
				}, {
					id: 8,
					icon: 'icon-baoxian1',
					url: "pages/index/billing/billingDetail/billingDetail",
					text: "保险到期"
				}]
			}
		},
		created() {
		},
		methods: {
			clickToDetail(item) {
				uni.navigateTo({
					url: item.url
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
</style>
