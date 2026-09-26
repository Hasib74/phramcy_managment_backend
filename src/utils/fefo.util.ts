export interface AvailableBatch {
  batchId: string;
  batchNumber: string;
  expiryDate: string | Date;
  quantityAvailable: number;
  sellingPrice: number;
  purchasePrice: number;
  unitCost: number;
  mrp: number;
}

export interface AllocatedBatchItem {
  batchId: string;
  batchNumber: string;
  expiryDate: string | Date;
  allocatedQuantity: number;
  unitPrice: number;
  unitCost: number;
  totalPrice: number;
  totalCost: number;
}

export interface AllocationResult {
  fulfilled: boolean;
  allocatedQuantity: number;
  remainingRequestedQuantity: number;
  allocations: AllocatedBatchItem[];
}

/**
 * FEFO (First Expiry, First Out) Batch Allocation Algorithm
 * Sorts available batches in ascending order of expiry date and allocates stock.
 */
export const allocateBatchesFEFO = (
  batches: AvailableBatch[],
  requestedQuantity: number
): AllocationResult => {
  // Sort batches by earliest expiry date first
  const sortedBatches = [...batches].sort((a, b) => {
    const dateA = new Date(a.expiryDate).getTime();
    const dateB = new Date(b.expiryDate).getTime();
    return dateA - dateB;
  });

  const allocations: AllocatedBatchItem[] = [];
  let remainingNeed = requestedQuantity;
  let totalAllocated = 0;

  for (const batch of sortedBatches) {
    if (remainingNeed <= 0) break;
    if (batch.quantityAvailable <= 0) continue;

    const allocQty = Math.min(batch.quantityAvailable, remainingNeed);
    const totalPrice = allocQty * batch.sellingPrice;
    const totalCost = allocQty * (batch.unitCost || batch.purchasePrice);

    allocations.push({
      batchId: batch.batchId,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate,
      allocatedQuantity: allocQty,
      unitPrice: batch.sellingPrice,
      unitCost: batch.unitCost || batch.purchasePrice,
      totalPrice,
      totalCost
    });

    totalAllocated += allocQty;
    remainingNeed -= allocQty;
  }

  return {
    fulfilled: remainingNeed === 0,
    allocatedQuantity: totalAllocated,
    remainingRequestedQuantity: remainingNeed,
    allocations
  };
};
