// quoteBuilderStepManager.js

class QuoteBuilderStepManager {
  constructor(allStepsData, productsData, selectionManager) {
    this.allSteps = allStepsData;      // [{ id, renderType, selectionMode, required, visibleWhen, ... }]
    this.allProducts = productsData;   // products referencing stepId
    this.selectionManager = selectionManager;

    this.visibleSteps = [];
    this.currentStepIndex = -1;
    this.updateVisibleStepsList();
  }

  /* ---------- Visibility evaluation (data-driven) ---------- */
  evaluateVisibleWhen(visibleWhen, selections) {
    if (!visibleWhen) return true;

    const satisfies = (req) => {
      if (!req || !req.stepId) return true;
      const sel = selections[req.stepId];
      if (!sel) return false;

      // For single selection: compare selected object's id
      if (!Array.isArray(sel)) {
        return sel.id === req.equals;
      }
      // For multi-selection: visible if any selected item matches
      return sel.some((p) => p?.id === req.equals);
    };

    if (visibleWhen.requires) {
      return satisfies(visibleWhen.requires);
    }

    if (Array.isArray(visibleWhen.anyOf)) {
      return visibleWhen.anyOf.some((r) => satisfies(r));
    }

    if (Array.isArray(visibleWhen.allOf)) {
      return visibleWhen.allOf.every((r) => satisfies(r));
    }

    // If structure unrecognized, default to visible
    return true;
  }

  updateVisibleStepsList() {
    const currentSelections = this.selectionManager.selections;

    this.visibleSteps = this.allSteps.filter((step) => {
      return this.evaluateVisibleWhen(step.visibleWhen, currentSelections);
    });

    // Clamp currentStepIndex if it went out of bounds after visibility change
    if (this.currentStepIndex >= this.visibleSteps.length) {
      this.currentStepIndex = this.visibleSteps.length - 1;
    }
    if (this.currentStepIndex < 0 && this.visibleSteps.length > 0) {
      this.currentStepIndex = 0;
    }
  }

  navigateTo(stepIndex) {
    if (stepIndex >= 0 && stepIndex < this.visibleSteps.length) {
      this.currentStepIndex = stepIndex;
      return this.getCurrentStep();
    }
    return null;
  }

  getCurrentStep() {
    return this.visibleSteps[this.currentStepIndex] || null;
  }

  getProductsForStep(stepId) {
    const selectedVehicle = this.selectionManager.selections['vehicle_select'];
    const selectedVehicleId = selectedVehicle?.id;

    return this.allProducts.filter((product) => {
      if (product.stepId !== stepId) return false;

      // Vehicle compatibility check (if specified)
      if (Array.isArray(product.compatibleVehicles) && selectedVehicleId) {
        if (!product.compatibleVehicles.includes(selectedVehicleId)) {
          return false;
        }
      }

      return true;
    });
  }

  isLastVisibleStep() {
    return this.currentStepIndex === this.visibleSteps.length - 1;
  }

  getTotalVisibleStepsCount() {
    return this.visibleSteps.length;
  }

  getCurrentStepDisplayIndex() {
    return this.currentStepIndex + 1;
  }
}
