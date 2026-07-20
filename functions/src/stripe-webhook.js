function parseStripeEvent(body) {
	if (!body || typeof body !== "object") return null;
	return {
		type: String(body.type || ""),
		data: body.data?.object || {},
	};
}

function extractSubscriptionDetails(event) {
	if (!event) return null;
	const { type, data } = event;

	const currentPeriodEnd = data.current_period_end
		? new Date(data.current_period_end * 1000).toISOString()
		: null;
	const cancelAtPeriodEnd = Boolean(data.cancel_at_period_end);

	if (type === "checkout.session.completed") {
		const uid = data.client_reference_id || data.metadata?.uid || null;
		const customerId = data.customer || null;
		return {
			uid,
			customerId,
			tier: "premium",
			status: "active",
			currentPeriodEnd,
			cancelAtPeriodEnd,
		};
	}

	if (
		type === "customer.subscription.created" ||
		type === "customer.subscription.updated"
	) {
		const uid = data.metadata?.uid || null;
		const customerId = data.customer || null;
		const status = data.status;
		const isPremium = status === "active" || status === "trialing";
		return {
			uid,
			customerId,
			tier: isPremium ? "premium" : "free",
			status,
			currentPeriodEnd,
			cancelAtPeriodEnd,
		};
	}

	if (type === "customer.subscription.deleted") {
		const uid = data.metadata?.uid || null;
		const customerId = data.customer || null;
		return {
			uid,
			customerId,
			tier: "free",
			status: "canceled",
			currentPeriodEnd,
			cancelAtPeriodEnd: false,
		};
	}

	return null;
}

module.exports = {
	parseStripeEvent,
	extractSubscriptionDetails,
};
