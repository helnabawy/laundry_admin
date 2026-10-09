import { describe, expect, it } from "vitest";
import { ORDER_PUSH_CHANNEL, orderFcmMessage, orderPushData } from "@/domain/push-message";

const job = { kind: "pickedUp", orderId: "o1", orderNumber: 1042, vendorId: "v1", status: "pickedUp" };

describe("order push message", () => {
  it("carries the data the app routes by, all as strings", () => {
    expect(orderPushData(job)).toEqual({
      type: "order",
      kind: "pickedUp",
      orderId: "o1",
      orderNumber: "1042",
      status: "pickedUp",
      vendorId: "v1",
    });
  });

  it("lands in the app's high-importance Android channel", () => {
    const message = orderFcmMessage({ token: "t", title: "Items collected", body: "…", data: orderPushData(job) });
    expect(ORDER_PUSH_CHANNEL).toBe("order_updates");
    expect(message.android).toEqual({ priority: "high", notification: { channelId: "order_updates", sound: "default" } });
    expect(message.notification).toEqual({ title: "Items collected", body: "…" });
    expect(message.data.orderId).toBe("o1");
  });
});
