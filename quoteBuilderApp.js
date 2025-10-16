(function () {
  const STORAGE_KEY = 'autospec:quote-builder:v1';
  const ENRICHMENT_CACHE_PREFIX = 'autospec:qb:enrich:';
  const VEHICLE_STEP_ID = 'vehicle_select';
  const FORM_STEP_ID = 'customer_form';
  const DEFAULT_STORE = 'autospec';
  const STORE_LABELS = {
    autospec: 'Autospec 4x4',
    linex: 'LINE-X (WA fulfilment)',
  };

  function normaliseStore(store) {
    return store === 'linex' ? 'linex' : DEFAULT_STORE;
  }

  function getQueryParams() {
    return new URLSearchParams(window.location.search || '');
  }

  function safeJsonParse(value) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  }

  function sessionGet(key) {
    try {
      return window.sessionStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function sessionSet(key, value) {
    try {
      window.sessionStorage.setItem(key, value);
    } catch (error) {
      // ignore storage errors
    }
  }

  function escapeHtml(value) {
    if (value == null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatCurrency(value) {
    if (typeof value !== 'number') return '';
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value);
  }

  function formatWeight(grams) {
    if (typeof grams !== 'number' || Number.isNaN(grams)) return '';
    return `${(grams / 1000).toFixed(1)} kg`;
  }

  function buildSummaryItems(steps, selections) {
    const items = [];
    steps.forEach((step) => {
      const selected = selections[step.id];
      if (!selected || !selected.length) return;
      const details = selected
        .map((product) => {
          const parts = [product.name || product.title || product.id];
          if (typeof product.price === 'number') {
            parts.push(formatCurrency(product.price));
          }
          if (typeof product.weight === 'number') {
            parts.push(formatWeight(product.weight));
          }
          return parts.join(' · ');
        })
        .join(' • ');
      items.push({ label: step.title, detail: details });
    });
    return items;
  }

  function buildSummaryHtml(items, totals, storeLabel) {
    const listItems = items
      .map(
        (item) => `
        <li><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.detail)}</li>
      `
      )
      .join('');
    return `
      <div>
        <p><strong>Store:</strong> ${escapeHtml(storeLabel)}</p>
        <ul>${listItems}</ul>
        <p><strong>Total:</strong> ${formatCurrency(totals.totalPrice || 0)}</p>
        <p><strong>Total weight:</strong> ${
          totals.totalWeight ? formatWeight(totals.totalWeight) : '—'
        }</p>
      </div>
    `;
  }

  function buildEmailMarkup(items, totals, storeLabel) {
    const listItems = items
      .map(
        (item) => `
        <li><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.detail)}</li>
      `
      )
      .join('');
    return `
      <p><strong>Store:</strong> ${escapeHtml(storeLabel)}</p>
      <ul>${listItems}</ul>
      <p><strong>Total:</strong> ${formatCurrency(totals.totalPrice || 0)}</p>
      <p><strong>Total weight:</strong> ${
        totals.totalWeight ? formatWeight(totals.totalWeight) : '—'
      }</p>
    `;
  }

  class QuoteBuilderApp {
    constructor(config) {
      this.config = config || {};
      this.products = (this.config.products || []).map((product) => ({ ...product }));
      this.steps = Array.isArray(this.config.steps) ? this.config.steps : [];
      this.queryParams = getQueryParams();
      this.debug = this.queryParams.get('debug') === '1';
      this.forcedStore = this.queryParams.get('store')
        ? normaliseStore(this.queryParams.get('store'))
        : null;

      this.selectionManager = new QuoteBuilderSelectionManager(this.products);
      this.stepManager = new QuoteBuilderStepManager(
        this.steps,
        this.products,
        this.selectionManager,
        { debug: this.debug }
      );
      this.ui = new QuoteBuilderUIManager();
      this.formErrors = {};
      this.touchedFields = new Set();
      this.showAllErrors = false;
      this.statusMessage = null;
      this.confirmationState = { visible: false };
      this.currentStore = DEFAULT_STORE;
      this.initialised = false;
      this.isSubmitting = false;

      this.bindUiHandlers();
    }

    logDebug(message, payload) {
      if (!this.debug) return;
      // eslint-disable-next-line no-console
      console.debug('[QuoteBuilderApp]', message, payload || '');
    }

    bindUiHandlers() {
      this.ui.setHandlers({
        onToggleProduct: (stepId, productId) => this.handleProductToggle(stepId, productId),
        onNext: () => this.goToNextStep(),
        onPrevious: () => this.goToPreviousStep(),
        onJumpToStep: (index) => this.jumpToStep(index),
        onRestart: () => this.handleRestart(),
        onSubmit: () => this.handleSubmit(),
        onFormChange: (field, value) => this.handleFormChange(field, value),
        onFieldBlur: (field) => this.handleFieldBlur(field),
        onEmptyStateBack: () => this.goToPreviousStep(),
      });
    }

    initialiseProducts() {
      this.products = (this.config.products || []).map((product) => ({
        ...product,
        price:
          typeof product.price === 'number'
            ? product.price
            : product.price
            ? Number(product.price)
            : undefined,
        weight:
          typeof product.weight === 'number'
            ? product.weight
            : product.weight
            ? Number(product.weight)
            : undefined,
      }));
      this.selectionManager.updateProducts(this.products);
      this.stepManager.products = this.products;
    }

    loadPersistedState() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = safeJsonParse(raw);
        if (!parsed) return;
        this.selectionManager.hydrate(parsed);
        this.formErrors = {};
        this.touchedFields = new Set();
        this.currentStore = parsed.store ? normaliseStore(parsed.store) : DEFAULT_STORE;
      } catch (error) {
        this.logDebug('Failed to read persisted state', error);
      }
    }

    persistState() {
      const state = {
        ...this.selectionManager.getPersistedState(),
        store: this.currentStore,
      };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (error) {
        this.logDebug('Failed to persist state', error);
      }
    }

    applyQueryOverrides() {
      const vehicleId = this.queryParams.get('vehicle');
      if (vehicleId && this.products.some((p) => p.id === vehicleId)) {
        this.selectionManager.setSelection(VEHICLE_STEP_ID, vehicleId);
      }
    }

    computeInitialStore() {
      if (this.forcedStore) return this.forcedStore;
      const stateValue = this.selectionManager.getFormValues().state;
      if (stateValue && stateValue.toUpperCase() === 'WA') {
        return 'linex';
      }
      return this.currentStore || DEFAULT_STORE;
    }

    async init() {
      if (!this.config || !this.config.steps || !this.config.products) {
        return;
      }
      this.initialiseProducts();
      this.loadPersistedState();
      this.applyQueryOverrides();
      this.currentStore = this.computeInitialStore();
      this.stepManager.refreshVisibility();
      this.stepManager.setActiveStepByIndex(0);
      this.render();
      await this.enrichProductsForStore(this.currentStore);
      this.initialised = true;
      this.render();
    }

    getEnrichmentCacheKey(store, variantId) {
      return `${ENRICHMENT_CACHE_PREFIX}${store}:${variantId}`;
    }

    async enrichProductsForStore(store) {
      const targetStore = normaliseStore(store);
      const variantIds = this.products
        .map((product) => product.variantIdByStore?.[targetStore])
        .filter(Boolean)
        .map(String);

      if (!variantIds.length) {
        this.logDebug('No variant IDs found for enrichment', targetStore);
        return;
      }

      const cached = {};
      const missing = [];
      variantIds.forEach((variantId) => {
        const cacheKey = this.getEnrichmentCacheKey(targetStore, variantId);
        const cachedEntry = sessionGet(cacheKey);
        if (cachedEntry) {
          const parsed = safeJsonParse(cachedEntry);
          if (parsed) {
            cached[variantId] = parsed;
          } else {
            missing.push(variantId);
          }
        } else {
          missing.push(variantId);
        }
      });

      let fetched = {};
      if (missing.length) {
        this.statusMessage = {
          status: 'info',
          message: 'Loading latest pricing…',
        };
        this.render();
        try {
          const response = await fetch('/api/quote-builder/enrich', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              store: targetStore,
              variantIds: missing.map((id) => Number(id)),
            }),
          });
          if (!response.ok) {
            throw new Error('Failed to load product pricing');
          }
          const data = await response.json();
          fetched = data.variants || {};
          Object.keys(fetched).forEach((variantId) => {
            const cacheKey = this.getEnrichmentCacheKey(targetStore, variantId);
            sessionSet(cacheKey, JSON.stringify(fetched[variantId]));
          });
          this.statusMessage = null;
        } catch (error) {
          this.statusMessage = {
            status: 'error',
            message: 'We could not refresh pricing. Showing saved values.',
          };
          this.logDebug('Enrichment error', error);
        }
      }

      const merged = { ...cached, ...fetched };
      this.products = this.products.map((product) => {
        const variantId = product.variantIdByStore?.[targetStore];
        const enrichment = variantId ? merged[String(variantId)] : null;
        if (!enrichment) return product;
        return {
          ...product,
          price:
            typeof enrichment.price === 'number' ? enrichment.price : product.price,
          weight:
            typeof enrichment.weight === 'number' ? enrichment.weight : product.weight,
          image: enrichment.image || product.image,
          handle: enrichment.handle || product.handle,
          stock: enrichment.stock || product.stock,
        };
      });
      this.selectionManager.updateProducts(this.products);
      this.stepManager.products = this.products;
      this.persistState();
    }

    getVisibleSteps() {
      return this.stepManager.getVisibleSteps();
    }

    getActiveStep() {
      return this.stepManager.getActiveStep();
    }

    getAccessibleStepIndex() {
      const steps = this.getVisibleSteps();
      let maxIndex = 0;
      for (let i = 0; i < steps.length; i += 1) {
        const step = steps[i];
        if (this.isStepComplete(step)) {
          maxIndex = i;
          continue;
        }
        return i;
      }
      return maxIndex;
    }

    handleProductToggle(stepId, productId) {
      const visibleSteps = this.getVisibleSteps();
      const stepIndex = visibleSteps.findIndex((step) => step.id === stepId);
      if (stepIndex === -1) return;
      const step = visibleSteps[stepIndex];
      const mode = step.selectionMode === 'multi' ? 'multi' : 'single';
      const beforeSelection = this.selectionManager.getSelectedProductIds(stepId);
      this.selectionManager.toggleSelection(stepId, productId, mode);
      const afterSelection = this.selectionManager.getSelectedProductIds(stepId);
      const changed = beforeSelection.join(',') !== afterSelection.join(',');
      if (changed && mode === 'single') {
        this.selectionManager.clearSelectionFromIndex(stepIndex + 1, visibleSteps);
      }
      this.stepManager.refreshVisibility();
      this.stepManager.setActiveStepById(stepId);
      this.persistState();
      this.render();
    }

    goToNextStep() {
      const activeStep = this.getActiveStep();
      if (activeStep && !this.isStepComplete(activeStep)) {
        this.render();
        return;
      }
      this.stepManager.goToNext();
      this.render();
    }

    goToPreviousStep() {
      if (this.confirmationState.visible) {
        this.confirmationState = { visible: false };
        this.render();
        return;
      }
      this.stepManager.goToPrevious();
      this.render();
    }

    jumpToStep(index) {
      const steps = this.getVisibleSteps();
      if (index < 0 || index >= steps.length) return;
      const accessibleIndex = this.getAccessibleStepIndex();
      if (index > accessibleIndex) return;
      this.stepManager.setActiveStepByIndex(index);
      this.render();
    }

    handleRestart() {
      this.selectionManager.clearAll();
      this.formErrors = {};
      this.touchedFields.clear();
      this.showAllErrors = false;
      this.confirmationState = { visible: false };
      this.currentStore = this.forcedStore || DEFAULT_STORE;
      this.isSubmitting = false;
      this.statusMessage = null;
      this.stepManager.refreshVisibility();
      this.stepManager.setActiveStepByIndex(0);
      window.localStorage.removeItem(STORAGE_KEY);
      this.render();
    }

    handleFormChange(field, value) {
      this.selectionManager.setFormValue(field, value);
      if (field === 'state' && !this.forcedStore) {
        const nextStore = value && value.toUpperCase() === 'WA' ? 'linex' : DEFAULT_STORE;
        if (nextStore !== this.currentStore) {
          this.currentStore = nextStore;
          this.enrichProductsForStore(this.currentStore).then(() => this.render());
        }
      }
      if (this.touchedFields.has(field) || this.showAllErrors) {
        this.formErrors[field] = this.validateField(field, value);
      }
      this.persistState();
      this.render();
    }

    handleFieldBlur(field) {
      this.touchedFields.add(field);
      const value = this.selectionManager.getFormValues()[field];
      this.formErrors[field] = this.validateField(field, value);
      this.render();
    }

    validateField(field, value) {
      const trimmed = (value || '').trim();
      switch (field) {
        case 'firstName':
        case 'lastName':
          if (!trimmed) return 'This field is required.';
          return '';
        case 'email':
          if (!trimmed) return 'Enter your email address.';
          if (!/^\S+@\S+\.\S+$/.test(trimmed)) return 'Enter a valid email address.';
          return '';
        case 'phone':
          if (!trimmed) return 'Enter your phone number.';
          if (!/^[0-9+()\s-]{6,}$/.test(trimmed)) return 'Enter a valid phone number.';
          return '';
        case 'state':
          if (!trimmed) return 'Select your state.';
          return '';
        case 'postcode':
          if (!trimmed) return '';
          if (!/^[0-9A-Za-z\s-]{3,10}$/.test(trimmed)) return 'Enter a valid postcode.';
          return '';
        default:
          return '';
      }
    }

    validateForm() {
      const values = this.selectionManager.getFormValues();
      const errors = {};
      (this.steps.find((step) => step.id === FORM_STEP_ID)?.fields || []).forEach((field) => {
        const error = this.validateField(field.id, values[field.id]);
        if (error) {
          errors[field.id] = error;
        }
      });
      this.formErrors = errors;
      return Object.keys(errors).length === 0;
    }

    isFormComplete() {
      const values = this.selectionManager.getFormValues();
      const step = this.steps.find((s) => s.id === FORM_STEP_ID);
      if (!step) return true;
      return (step.fields || []).every((field) => {
        if (!field.required) return true;
        return this.validateField(field.id, values[field.id]) === '';
      });
    }

    isStepComplete(step) {
      if (!step) return false;
      if (step.selectionMode === 'form') {
        return this.isFormComplete();
      }
      return this.selectionManager.isStepComplete(step);
    }

    async handleSubmit() {
      this.showAllErrors = true;
      const isValid = this.validateForm();
      if (!isValid) {
        this.render();
        return;
      }
      const store = this.forcedStore || (this.selectionManager.getFormValues().state === 'WA' ? 'linex' : this.currentStore);
      this.currentStore = normaliseStore(store);
      const lineItems = this.selectionManager.getLineItemsForStore(this.currentStore);
      if (!lineItems.length) {
        this.statusMessage = {
          status: 'error',
          message: 'No products could be added to the draft order. Please review your selections.',
        };
        this.render();
        return;
      }

      const formValues = this.selectionManager.getFormValues();
      const payload = {
        store: this.currentStore,
        customer: {
          firstName: formValues.firstName,
          lastName: formValues.lastName,
          email: formValues.email,
          phone: formValues.phone,
          state: formValues.state,
          postcode: formValues.postcode,
          notes: formValues.notes,
        },
        items: lineItems,
        meta: {
          vehicleId: this.selectionManager.getVehicleId(),
          selections: { ...this.selectionManager.stepSelections },
        },
      };

      this.statusMessage = {
        status: 'info',
        message: 'Creating your draft order…',
      };
      this.isSubmitting = true;
      this.render();

      try {
        const response = await fetch('/api/quote-builder/draft-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error('Draft order request failed');
        }
        const data = await response.json();
        this.statusMessage = null;
        this.isSubmitting = false;
        const totals = this.selectionManager.getTotals();
        const summaryItems = buildSummaryItems(this.getVisibleSteps(), this.selectionManager.getAllSelectedProducts());
        const storeLabel = STORE_LABELS[this.currentStore] || this.currentStore;
        this.confirmationState = {
          visible: true,
          heading: 'Quote request sent',
          message: 'Our team will be in touch soon with your full quote and lead times.',
          summaryHtml: buildSummaryHtml(summaryItems, totals, storeLabel),
          emailMarkup: buildEmailMarkup(summaryItems, totals, storeLabel),
          orderUrl: data.orderUrl || '',
        };
        this.render();
      } catch (error) {
        this.statusMessage = {
          status: 'error',
          message: 'We could not create a draft order. Please try again.',
        };
        this.logDebug('Draft order error', error);
        this.isSubmitting = false;
        this.render();
      }
    }

    buildUiState() {
      const steps = this.getVisibleSteps();
      const activeStep = this.getActiveStep();
      const activeIndex = this.stepManager.activeIndex;
      const selectionsByStep = this.selectionManager.getAllSelectedProducts();
      const totals = this.selectionManager.getTotals();
      const summaryItems = buildSummaryItems(steps, selectionsByStep);
      const storeLabel = STORE_LABELS[this.currentStore] || this.currentStore;
      const selectedIds = activeStep
        ? this.selectionManager.getSelectedProductIds(activeStep.id)
        : [];
      const groupedProducts = activeStep
        ? this.stepManager.getProductsGroupedForStep(activeStep.id)
        : { compatible: [], incompatible: [] };
      const stepIsEmpty =
        activeStep &&
        activeStep.selectionMode !== 'form' &&
        groupedProducts.compatible.length === 0;
      const stepHelperText =
        activeStep &&
        activeStep.required &&
        activeStep.selectionMode !== 'form' &&
        !this.selectionManager.isStepComplete(activeStep)
          ? 'Select an option to continue.'
          : '';

      const formValues = this.selectionManager.getFormValues();
      const visibleErrors = {};
      Object.keys(this.formErrors).forEach((field) => {
        if (this.showAllErrors || this.touchedFields.has(field)) {
          visibleErrors[field] = this.formErrors[field];
        }
      });

      const progressSteps = steps.map((step, index) => ({
        id: step.id,
        title: step.title,
        status:
          index < activeIndex
            ? 'complete'
            : index === activeIndex
            ? 'current'
            : 'upcoming',
      }));

      const navigationState = {
        canGoPrevious: activeIndex > 0,
        canGoNext: activeIndex < steps.length - 1,
        isLastStep: activeIndex === steps.length - 1,
        nextDisabled:
          this.isSubmitting || (activeStep && !this.isStepComplete(activeStep)),
        nextLabel: 'Next step',
        submitLabel: 'Submit quote',
        blockingMessage:
          activeStep && !this.isStepComplete(activeStep)
            ? activeStep.selectionMode === 'form'
              ? 'Complete the required fields to submit.'
              : activeStep.required
              ? 'Select an option to continue.'
              : ''
            : '',
      };

      return {
        progress: {
          steps: progressSteps,
          activeIndex,
        },
        summary: {
          items: summaryItems,
          totalPrice: totals.totalPrice,
          totalWeight: totals.totalWeight,
          storeLabel,
        },
        step: {
          step: activeStep,
          products: groupedProducts,
          selectedProductIds: selectedIds,
          helperText: stepHelperText,
          isEmpty: stepIsEmpty,
        },
        navigation: navigationState,
        form: {
          values: formValues,
          errors: visibleErrors,
        },
        status: this.statusMessage,
        confirmation: this.confirmationState,
      };
    }

    render() {
      const state = this.buildUiState();
      this.ui.render(state);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const config = window.QUOTE_BUILDER_BOOTSTRAP;
    if (!config) return;
    const app = new QuoteBuilderApp(config);
    app.init();
    window.quoteBuilderApp = app;
  });
})();
