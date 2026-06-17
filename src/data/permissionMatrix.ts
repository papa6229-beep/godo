export type PermissionLevel = 'AUTO' | 'DRAFT_ONLY' | 'APPROVAL_REQUIRED' | 'MANUAL_ONLY';

export const permissionMatrix: Record<PermissionLevel, string[]> = {
  AUTO: [
    'order_read',
    'inquiry_classify',
    'review_analyze',
    'inventory_check',
    'sales_summary'
  ],
  DRAFT_ONLY: [
    'cs_reply_draft',
    'review_reply_draft',
    'product_description_draft',
    'marketing_copy_draft'
  ],
  APPROVAL_REQUIRED: [
    'board_reply_post',
    'coupon_create',
    'product_update',
    'campaign_publish'
  ],
  MANUAL_ONLY: [
    'refund_execute',
    'price_change',
    'bulk_sms_send',
    'customer_delete'
  ]
};
