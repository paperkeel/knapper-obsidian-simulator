import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

interface ResetDialogProps {
	open: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}

export function ResetDialog({ open, onCancel, onConfirm }: ResetDialogProps) {
	const dialogRef = useRef<HTMLDialogElement>(null);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	}, [open]);

	return (
		<dialog
			ref={dialogRef}
			aria-labelledby="reset-dialog-title"
			className="w-[min(100%_-_2rem,28rem)] rounded-2xl border border-border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-foreground/20 dark:shadow-none"
			onCancel={(event) => {
				event.preventDefault();
				onCancel();
			}}
			onClose={onCancel}
		>
			<div className="flex flex-col gap-5 p-6">
				<div className="flex flex-col gap-2">
					<h2
						id="reset-dialog-title"
						className="text-lg font-medium text-balance"
					>
						Reset simulator data?
					</h2>
					<p className="text-sm text-pretty text-muted-foreground">
						This clears saved tabs, sizes, settings, and simulator
						files. Vault files move to recoverable local trash.
					</p>
				</div>
				<div className="flex flex-wrap justify-end gap-2">
					<Button type="button" variant="ghost" onClick={onCancel}>
						Cancel
					</Button>
					<Button
						type="button"
						variant="destructive"
						onClick={onConfirm}
					>
						Reset data
					</Button>
				</div>
			</div>
		</dialog>
	);
}
