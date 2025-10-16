(function () {
  const VEHICLE_STEP_ID = 'vehicle_select';
  const STORAGE_VERSION = '1.1.0';

  function normaliseStore(store) {
    return store === 'linex' ? 'linex' : 'autospec';
  }

  class QuoteBuilderSelectionManager {
    constructor(products) {
      this.productsById = {};
      (products || []).forEach((product) => {
        if (product && product.id) {
          this.productsById[product.id] = { ...product };
        }
      });
      this.stepSelections = {};
      this.formValues = {
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        state: '',
        postcode: '',
        notes: '',
      };
      this.vehicleSelection = {
        make: '',
        model: '',
        year: '',
      };
      this.meta = {
        version: STORAGE_VERSION,
      };
    }

    updateProducts(products) {
      (products || []).forEach((product) => {
        if (product && product.id) {
          const existing = this.productsById[product.id] || {};
          this.productsById[product.id] = {
            ...existing,
            ...product,
          };
        }
      });
    }

    hydrate(state) {
      if (!state || state.meta?.version !== STORAGE_VERSION) {
        return;
      }

      if (state.stepSelections && typeof state.stepSelections === 'object') {
        this.stepSelections = {};
        Object.keys(state.stepSelections).forEach((stepId) => {
          const ids = Array.isArray(state.stepSelections[stepId])
            ? state.stepSelections[stepId].filter((id) => this.productsById[id])
            : [];
          if (ids.length) {
            this.stepSelections[stepId] = ids;
          }
        });
      }

      if (state.formValues && typeof state.formValues === 'object') {
        this.formValues = {
          ...this.formValues,
          ...state.formValues,
        };
      }

      if (state.vehicleSelection && typeof state.vehicleSelection === 'object') {
        this.vehicleSelection = {
          make: state.vehicleSelection.make || '',
          model: state.vehicleSelection.model || '',
          year: state.vehicleSelection.year || '',
        };
      }
    }

    getPersistedState() {
      return {
        stepSelections: this.stepSelections,
        formValues: this.formValues,
        vehicleSelection: this.vehicleSelection,
        meta: this.meta,
      };
    }

    clearAll() {
      this.stepSelections = {};
      this.formValues = {
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        state: '',
        postcode: '',
        notes: '',
      };
      this.vehicleSelection = {
        make: '',
        model: '',
        year: '',
      };
    }

    setFormValue(field, value) {
      if (Object.prototype.hasOwnProperty.call(this.formValues, field)) {
        this.formValues[field] = value;
      }
    }

    setFormValues(values) {
      if (!values) return;
      Object.keys(this.formValues).forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(values, field)) {
          this.formValues[field] = values[field] || '';
        }
      });
    }

    getFormValues() {
      return { ...this.formValues };
    }

    setVehicleSelection(partial) {
      if (!partial || typeof partial !== 'object') return;
      const next = { ...this.vehicleSelection };
      if (Object.prototype.hasOwnProperty.call(partial, 'make')) {
        next.make = partial.make || '';
        next.model = '';
        next.year = '';
      }
      if (Object.prototype.hasOwnProperty.call(partial, 'model')) {
        next.model = partial.model || '';
        next.year = '';
      }
      if (Object.prototype.hasOwnProperty.call(partial, 'year')) {
        next.year = partial.year || '';
      }
      this.vehicleSelection = next;
    }

    getVehicleSelection() {
      return { ...this.vehicleSelection };
    }

    toggleSelection(stepId, productId, mode) {
      if (!productId || !this.productsById[productId]) {
        return;
      }
      const selectionMode = mode || 'single';
      const existing = this.stepSelections[stepId] || [];
      const index = existing.indexOf(productId);

      let nextSelection;
      if (selectionMode === 'multi') {
        if (index > -1) {
          nextSelection = existing.filter((id) => id !== productId);
        } else {
          nextSelection = [...existing, productId];
        }
      } else {
        if (index > -1) {
          nextSelection = [];
        } else {
          nextSelection = [productId];
        }
      }

      if (nextSelection && nextSelection.length) {
        this.stepSelections[stepId] = nextSelection;
      } else {
        delete this.stepSelections[stepId];
      }

      const eventDetail = {
        type: nextSelection && nextSelection.length ? 'selected' : 'deselected',
        stepId,
        productId,
      };
      window.dispatchEvent(
        new CustomEvent('qb:event', { detail: eventDetail })
      );
    }

    setSelection(stepId, productIds) {
      if (!productIds) {
        delete this.stepSelections[stepId];
        window.dispatchEvent(
          new CustomEvent('qb:event', {
            detail: {
              type: 'deselected',
              stepId,
              productId: null,
            },
          })
        );
        return;
      }

      const ids = Array.isArray(productIds) ? productIds : [productIds];
      const filtered = ids.filter((id) => this.productsById[id]);
      if (filtered.length) {
        const previous = this.stepSelections[stepId] || [];
        const previousKey = previous.join(',');
        const nextKey = filtered.join(',');
        this.stepSelections[stepId] = filtered;
        if (previousKey === nextKey) {
          return;
        }
        const product = this.productsById[filtered[0]];
        if (stepId === VEHICLE_STEP_ID && product) {
          this.vehicleSelection = {
            make: product.make || this.vehicleSelection.make || '',
            model: product.model || this.vehicleSelection.model || '',
            year: this.vehicleSelection.year || '',
          };
        }
        window.dispatchEvent(
          new CustomEvent('qb:event', {
            detail: {
              type: 'selected',
              stepId,
              productId: filtered[0],
            },
          })
        );
      } else {
        delete this.stepSelections[stepId];
      }
    }

    clearSelection(stepId) {
      delete this.stepSelections[stepId];
    }

    clearSelectionFromIndex(stepIndex, steps) {
      if (!Array.isArray(steps)) return;
      for (let i = stepIndex; i < steps.length; i += 1) {
        const stepId = steps[i]?.id;
        if (stepId) {
          delete this.stepSelections[stepId];
        }
      }
    }

    getSelectedProductIds(stepId) {
      return this.stepSelections[stepId] ? [...this.stepSelections[stepId]] : [];
    }

    getSelectedProducts(stepId) {
      const ids = this.getSelectedProductIds(stepId);
      return ids
        .map((id) => this.productsById[id])
        .filter((product) => !!product);
    }

    getAllSelectedProducts() {
      const result = {};
      Object.keys(this.stepSelections).forEach((stepId) => {
        result[stepId] = this.getSelectedProducts(stepId);
      });
      return result;
    }

    isStepComplete(step) {
      if (!step) return false;
      if (step.selectionMode === 'none' || step.selectionMode === 'form') {
        return true;
      }
      const selections = this.getSelectedProductIds(step.id);
      if (!selections.length) {
        return !step.required;
      }
      if (step.selectionMode === 'single') {
        return selections.length === 1;
      }
      return selections.length > 0;
    }

    getVehicleId() {
      const ids = this.getSelectedProductIds(VEHICLE_STEP_ID);
      return ids.length ? ids[0] : null;
    }

    getTotals() {
      const lineItems = [];
      let totalPrice = 0;

      Object.keys(this.stepSelections).forEach((stepId) => {
        this.stepSelections[stepId].forEach((productId) => {
          const product = this.productsById[productId];
          if (!product) return;
          if (typeof product.price === 'number') {
            totalPrice += product.price;
          }
          lineItems.push({ productId, stepId });
        });
      });

      return {
        lineItems,
        totalPrice,
      };
    }

    getLineItemsForStore(store) {
      const resolvedStore = normaliseStore(store);
      const items = [];
      Object.keys(this.stepSelections).forEach((stepId) => {
        this.stepSelections[stepId].forEach((productId) => {
          const product = this.productsById[productId];
          if (!product) return;
          const variantId = product.variantIdByStore?.[resolvedStore];
          if (variantId) {
            items.push({
              variantId,
              quantity: 1,
            });
          }
        });
      });
      return items;
    }
  }

  window.QuoteBuilderSelectionManager = QuoteBuilderSelectionManager;
})();
