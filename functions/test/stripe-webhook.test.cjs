const test = require("node:test");
const assert = require("node:assert/strict");
const {
	parseStripeEvent,
	extractSubscriptionDetails,
} = require("../src/stripe-webhook.js");

test("extrai detalhes de checkout.session.completed para ativar premium", () => {
	const event = parseStripeEvent({
		type: "checkout.session.completed",
		data: {
			object: {
				client_reference_id: "user-123",
				customer: "cus_12345",
			},
		},
	});
	const details = extractSubscriptionDetails(event);
	assert.equal(details.uid, "user-123");
	assert.equal(details.customerId, "cus_12345");
	assert.equal(details.tier, "premium");
	assert.equal(details.status, "active");
});

test("extrai detalhes de customer.subscription.deleted para desativar premium", () => {
	const event = parseStripeEvent({
		type: "customer.subscription.deleted",
		data: {
			object: {
				customer: "cus_12345",
				metadata: { uid: "user-123" },
			},
		},
	});
	const details = extractSubscriptionDetails(event);
	assert.equal(details.uid, "user-123");
	assert.equal(details.tier, "free");
	assert.equal(details.status, "canceled");
});
