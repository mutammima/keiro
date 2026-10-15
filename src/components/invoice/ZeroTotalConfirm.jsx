/**
 * ZeroTotalConfirm — "Generate a $0.00 invoice?" guard, shared by the normal
 * and Easy invoice screens (useInvoiceForm's zeroConfirm / confirmZeroTotal).
 */
import ConfirmDialog from '../ui/ConfirmDialog';

export default function ZeroTotalConfirm({ open, onCancel, onConfirm }) {
  return (
    <ConfirmDialog
      open={open} title="Generate a $0.00 invoice?"
      cancelLabel="Go back" confirmLabel="Generate anyway"
      onCancel={onCancel} onConfirm={onConfirm}
    >
      This invoice totals <strong>$0.00</strong> — usually that means an item is missing a price. Generate it anyway?
    </ConfirmDialog>
  );
}
