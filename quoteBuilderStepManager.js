(function () {
  function matchesRequirement(selectionManager, requirement) {
    if (!requirement || !requirement.stepId) return true;
    const selectedIds = selectionManager.getSelectedProductIds(requirement.stepId);
    if (!selectedIds.length) return false;
    if (typeof requirement.equals === 'undefined') {
      return selectedIds.length > 0;
    }
    return selectedIds.includes(requirement.equals);
  }

  function evaluateVisibility(selectionManager, visibleWhen) {
    if (!visibleWhen) return true;
    if (visibleWhen.requires) {
      return matchesRequirement(selectionManager, visibleWhen.requires);
    }
    if (Array.isArray(visibleWhen.anyOf)) {
      return visibleWhen.anyOf.some((req) => matchesRequirement(selectionManager, req));
    }
    if (Array.isArray(visibleWhen.allOf)) {
      return visibleWhen.allOf.every((req) => matchesRequirement(selectionManager, req));
    }
    return true;
  }

  class QuoteBuilderStepManager {
    constructor(steps, products, selectionManager, options = {}) {
      this.allSteps = Array.isArray(steps) ? steps : [];
      this.products = Array.isArray(products) ? products : [];
      this.selectionManager = selectionManager;
      this.debug = !!options.debug;
      this.activeIndex = 0;
      this.visibleSteps = this.computeVisibleSteps();
    }

    logDebug(message, payload) {
      if (!this.debug) return;
      // eslint-disable-next-line no-console
      console.debug('[QuoteBuilderStepManager]', message, payload || '');
    }

    computeVisibleSteps() {
      const visible = this.allSteps.filter((step) =>
        evaluateVisibility(this.selectionManager, step.visibleWhen)
      );
      if (this.activeIndex >= visible.length) {
        this.activeIndex = Math.max(visible.length - 1, 0);
      }
      return visible;
    }

    refreshVisibility() {
      this.visibleSteps = this.computeVisibleSteps();
      return this.visibleSteps;
    }

    getVisibleSteps() {
      return this.visibleSteps;
    }

    getStepIndex(stepId) {
      return this.visibleSteps.findIndex((step) => step.id === stepId);
    }

    getActiveStep() {
      return this.visibleSteps[this.activeIndex] || null;
    }

    setActiveStepByIndex(index) {
      if (index < 0 || index >= this.visibleSteps.length) {
        return this.getActiveStep();
      }
      this.activeIndex = index;
      return this.getActiveStep();
    }

    setActiveStepById(stepId) {
      const index = this.getStepIndex(stepId);
      if (index > -1) {
        this.activeIndex = index;
      }
      return this.getActiveStep();
    }

    goToNext() {
      if (this.activeIndex < this.visibleSteps.length - 1) {
        this.activeIndex += 1;
      }
      return this.getActiveStep();
    }

    goToPrevious() {
      if (this.activeIndex > 0) {
        this.activeIndex -= 1;
      }
      return this.getActiveStep();
    }

    getProductsForStep(stepId) {
      const vehicleId = this.selectionManager.getVehicleId();
      return this.products
        .filter((product) => product.stepId === stepId)
        .map((product) => {
          const compatibility = Array.isArray(product.compatibleVehicles)
            ? product.compatibleVehicles
            : null;
          const isCompatible =
            !vehicleId ||
            !compatibility ||
            compatibility.length === 0 ||
            compatibility.includes(vehicleId);
          return {
            ...product,
            isCompatible,
          };
        });
    }

    getProductsGroupedForStep(stepId) {
      const items = this.getProductsForStep(stepId);
      return {
        compatible: items.filter((item) => item.isCompatible),
        incompatible: items.filter((item) => !item.isCompatible),
      };
    }
  }

  window.QuoteBuilderStepManager = QuoteBuilderStepManager;
})();
