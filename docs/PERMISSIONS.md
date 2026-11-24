# Role and Shop Permissions

| Capability | Manager | Cashier | Waiter | Kitchen Staff | Admin |
|---|---|---|---|---|---|
| Multiple shops | Assigned only | No | No | No | Reserved |
| Dashboard | Yes, assigned | No | No | No | Reserved |
| Menu changes | Yes | No | No | No | No dashboard |
| Tasks | Create/complete | Complete own | Complete own | Complete own | Reserved |
| Orders | View assigned | Takeaway/payments | Create/edit | Prepare/ready | Reserved |
| Payments | Review/confirm only as cashier policy permits | Confirm | Request only | No | Reserved |
| Inventory | Adjust/review | No | No | Adjustment per role policy | Reserved |

Shop IDs supplied by clients are replaced or validated by `requireShop`; object operations must query within the shop and employee authorization context.
