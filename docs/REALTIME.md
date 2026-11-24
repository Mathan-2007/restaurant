# Realtime

Socket.IO connections authenticate their HttpOnly session cookie. Clients may only emit `shop.subscribe` with an authorized shop ID. Authorized connections join `shop:<shopId>` and `role:<role>:shop:<shopId>` rooms.

Supported event types include order created/updated/cancelled, kitchen tickets, payment requests/completion, tasks, menu, inventory and shop status. `OutboxEvent` records are written in the same transactions as business changes and are intended for background delivery recovery.
