/**
 * CommandQueue - Ensures sequential command execution
 */
export class CommandQueue {
	private queue: Array<() => Promise<void>> = [];
	private isProcessing = false;

	/**
	 * Enqueue an operation for sequential execution.
	 */
	async enqueue<T>(operation: () => T | Promise<T>): Promise<T> {
		return new Promise((resolve, reject) => {
			this.queue.push(async () => {
				try {
					const result = await operation();
					resolve(result);
				} catch (error) {
					reject(error);
				}
			});
			this.processQueue();
		});
	}

	/**
	 * Process queued operations one at a time.
	 */
	private async processQueue(): Promise<void> {
		if (this.isProcessing) return;

		this.isProcessing = true;

		while (this.queue.length > 0) {
			const operation = this.queue.shift();
			if (operation) {
				try {
					await operation();
				} catch {
					// Error already handled in enqueue's try/catch
				}
			}
		}

		this.isProcessing = false;
	}
}
