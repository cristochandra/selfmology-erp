
# Invoices & Inventory Upgrade Implementation

## Changes Made
1. **Inventory Module Overhead**: Implemented Batch and Expiry date tracking. Stock now displays location information and separates between `Warehouse` (Offline) and `Online Warehouse`. 
2. **Move Stock**: Created a new UI under the Inventory tab allowing admins to move stock between the Offline and Online warehouses.
3. **Invoices Itemized Discounts**: Modified the invoice creation process so discounts are now defined per item.
4. **Stock Availability on Invoice**: The Add Line Item dropdown now shows the available stock in the tooltip so users know exactly what can be billed.
5. **Invoice Deletion / Cancellation**: Added buttons for users to manage erroneous records:
    * **Delete**: Removes Draft invoices entirely.
    * **Cancel**: Marks finalized, unpaid invoices as cancelled.

## Testing Performed
1. Verified backend formulas successfully manage minus stock and warehouse location mapping.
2. Verified Invoices can properly delete, cancelling old ones properly changes their status.
3. Added the dashboard notifications alerting on low online stock and overdue invoices.

