export default function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-md p-6 shadow-xl w-full max-w-[340px] text-center">
        <h2 className="text-lg font-semibold text-main mb-2">Are you sure?</h2>
        <p className="text-sm text-muted mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            className="flex-1 py-2 text-sm font-medium border border-border text-main hover:bg-hover-bg rounded-sm transition-all"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="flex-1 py-2 text-sm font-medium bg-error text-white hover:opacity-90 rounded-sm transition-all"
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
