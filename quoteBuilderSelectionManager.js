// quoteBuilderSelectionManager.js

class QuoteBuilderSelectionManager {
  constructor() {
    this.selections = {};
    this.totalPrice = 0;
    this.totalWeight = 0;
  }

  updateSelection(stepId, product, selectionMode = 'single') {
    if (selectionMode === 'multiple') {
      if (!this.selections[stepId]) {
        this.selections[stepId] = [];
      }
      const index = this.selections[stepId].findIndex((p) => p.id === product.id);
      if (index > -1) {
        // Already selected → remove it
        this.selections[stepId].splice(index, 1);
      } else {
        this.selections[stepId].push(product);
      }
    } else {
      // Single selection
      this.selections[stepId] = product ? product : undefined;
    }

    this.totalPrice = this.calculateTotalPrice();
    this.totalWeight = this.calculateTotalWeight();
  }

  getSelectedProductForStep(stepId) {
    return this.selections[stepId] || null;
  }

  calculateTotalPrice() {
    let total = 0;
    for (const value of Object.values(this.selections)) {
      if (Array.isArray(value)) {
        value.forEach((item) => {
          total += item.price || 0;
        });
      } else if (value && value.price) {
        total += value.price;
      }
    }
    return total;
  }

  calculateTotalWeight() {
    let total = 0;
    for (const value of Object.values(this.selections)) {
      if (Array.isArray(value)) {
        value.forEach((item) => {
          total += item.weight || 0;
        });
      } else if (value && value.weight) {
        total += value.weight;
      }
    }
    return total;
  }

  getQuoteDetails() {
    return {
      selections: { ...this.selections },
      totalPrice: this.totalPrice,
      totalWeight: this.totalWeight,
    };
  }

  select(stepId, value) {
    this.selections[stepId] = value;
    this.totalPrice = this.calculateTotalPrice();
    this.totalWeight = this.calculateTotalWeight();
  }

  isStepSelected(stepId, step) {
    const selected = this.selections[stepId];

    if (!selected) return !step?.required;

    if (stepId === 'vehicle_select') {
      return (
        typeof selected === 'object' &&
        selected.make &&
        selected.model &&
        selected.year &&
        selected.id
      );
    }

    if (Array.isArray(selected)) {
      return selected.length > 0;
    }

    return true;
  }

  clearSelectionFrom(stepIdToClearFrom, allSteps) {
    const index = allSteps.findIndex((s) => s.id === stepIdToClearFrom);
    if (index === -1) return;

    for (let i = index; i < allSteps.length; i++) {
      delete this.selections[allSteps[i].id];
    }
    this.totalPrice = this.calculateTotalPrice();
    this.totalWeight = this.calculateTotalWeight();
  }

  clearSelection(stepId) {
    delete this.selections[stepId];
    this.totalPrice = this.calculateTotalPrice();
    this.totalWeight = this.calculateTotalWeight();
  }
}
