async function fetchProductDetailsFromWorker(variantId) {
  const response = await fetch(
    `https://workers-playground-autumn-tooth-f383.matt-skeoch.workers.dev/?variant_id=${variantId}`
  );

  if (!response.ok) {
    console.error("Failed to fetch product details");
    return null;
  }
  return await response.json();
}

class QuoteBuilderApp {
  constructor(data) {
    this.data = data;
    this.selectionManager = new QuoteBuilderSelectionManager();
    this.uiManager = new QuoteBuilderUIManager(this.selectionManager);
    this.stepManager = new QuoteBuilderStepManager(
      this.data.steps,
      this.data.products,
      this.selectionManager
    );

    this.nextButton = document.getElementById("quoteBuilderNextStepButton");
    this.prevButton = document.getElementById("quoteBuilderPrevStepButton");
    this.getQuoteButton = document.getElementById("quoteBuilderGetQuoteButtonMain");
  }

  async init() {
    if (!this.uiManager.stepsContainer) return;

    // Fetch real Shopify data for each product
    await this.enrichProductData();

    this.attachEventListeners();

    document.addEventListener("quoteBuilder:selectionUpdated", () => {
      this.updateNavigation();
    });

    this.stepManager.updateVisibleStepsList();
    this.goToStep(0);
    this.uiManager.updateRunningTotalOnly(this.selectionManager.totalPrice);
  }

  async enrichProductData() {
    const promises = this.data.products.map(async (product) => {
      const autospecVariantId = product.variantIdByStore?.autospec;
      if (autospecVariantId) {
        const fullDetails = await fetchProductDetailsFromWorker(autospecVariantId);
        if (fullDetails) {
          product.price = parseFloat(fullDetails.price);
          product.title = fullDetails.product_title;
          product.weight = fullDetails.weight;
          product.handle = fullDetails.handle;
          product.image = fullDetails.image;
        }
      }
    });
    await Promise.all(promises);
  }

  attachEventListeners() {
    this.uiManager.stepsContainer.addEventListener("click", (event) => {
      const targetButton = event.target.closest(".option-select-button");
      if (targetButton) {
        const card = targetButton.closest(".option-card");
        const productId = card?.dataset.productId;
        const stepId = card?.dataset.stepId;
        if (productId && stepId) {
          this.handleProductSelect(productId, stepId, true);
        }
      }
    });

    this.uiManager.stepsContainer.addEventListener("change", (event) => {
      if (event.target.classList.contains("vehicle-select-dropdown")) {
        const productId = event.target.value;
        const stepId = event.target.dataset.stepId;
        this.handleProductSelect(productId, stepId, false);
      }
    });

    if (this.nextButton)
      this.nextButton.addEventListener("click", () => this.handleNextStep());
    if (this.prevButton)
      this.prevButton.addEventListener("click", () => this.handlePrevStep());
    if (this.getQuoteButton)
      this.getQuoteButton.addEventListener("click", () => this.handleGetQuote());
  }

  handleProductSelect(productId, stepId, isCardClick) {
    let productToSelect = null;
    if (productId && productId !== "") {
      productToSelect = this.data.products.find((p) => p.id === productId);
    }

    const step = this.data.steps.find((s) => s.id === stepId);
    const selectionMode = step?.selectionMode || "single";
    const prevSelection = this.selectionManager.getSelectedProductForStep(stepId);
    let finalProduct = productToSelect;

    if (isCardClick) {
      if (selectionMode === "multiple") {
        // multiple handled internally
      } else if (prevSelection?.id === productId) {
        finalProduct = null;
      }
    } else if (!productToSelect) {
      finalProduct = null;
    }

    // Clear downstream selections if parent choice changes
    if (selectionMode !== "multiple" && prevSelection?.id !== finalProduct?.id) {
      const currentIndex = this.stepManager.allSteps.findIndex((s) => s.id === stepId);
      if (currentIndex !== -1) {
        const nextStep = this.stepManager.allSteps[currentIndex + 1];
        if (nextStep) {
          this.selectionManager.clearSelectionFrom(nextStep.id, this.stepManager.allSteps);
        }
      }
    }

    this.selectionManager.updateSelection(stepId, finalProduct, selectionMode);
    this.stepManager.updateVisibleStepsList();

    const newVisibleSteps = this.stepManager.visibleSteps;
    const newStepIndex = newVisibleSteps.findIndex((s) => s.id === stepId);
    if (newStepIndex !== -1) {
      this.stepManager.currentStepIndex = newStepIndex;
    }

    this.renderCurrentStepUI();
    this.uiManager.updateRunningTotalOnly(this.selectionManager.totalPrice);
    this.updateNavigation();
  }

  goToStep(index) {
    const step = this.stepManager.navigateTo(index);
    if (step) {
      this.renderCurrentStepUI();
      this.updateNavigation();
    }
  }

  renderCurrentStepUI() {
    const step = this.stepManager.getCurrentStep();
    if (!step) return;
    const products = this.stepManager.getProductsForStep(step.id);

    this.uiManager.stepsContainer.innerHTML = "";
    const stepElement = this.uiManager.renderStep(step, products, this.selectionManager.selections);
    this.uiManager.stepsContainer.appendChild(stepElement);

    this.uiManager.updateProgress(
      this.stepManager.getCurrentStepDisplayIndex(),
      this.stepManager.getTotalVisibleStepsCount()
    );
  }

  updateNavigation() {
    const currentStep = this.stepManager.getCurrentStep();
    const isFirst = this.stepManager.currentStepIndex === 0;
    const isLast = this.stepManager.isLastVisibleStep();

    const isFormStep = currentStep?.renderType === "form";
    const isOptionalMulti =
      currentStep?.selectionMode === "multiple" && !currentStep?.required;

    const currentSelected =
      currentStep &&
      (this.selectionManager.isStepSelected(currentStep.id, currentStep) ||
        isOptionalMulti ||
        isFormStep);

    this.uiManager.updateNavigationButtons(
      !isFirst,
      !isLast,
      isLast && currentSelected,
      currentSelected
    );
  }

  handleNextStep() {
    if (!this.stepManager.isLastVisibleStep()) {
      this.goToStep(this.stepManager.currentStepIndex + 1);
    }
  }

  handlePrevStep() {
    if (this.stepManager.currentStepIndex > 0) {
      this.goToStep(this.stepManager.currentStepIndex - 1);
    }
  }

  async handleGetQuote() {
    const { selections, totalPrice } = this.selectionManager.getQuoteDetails();
    let totalWeightGrams = 0;

    Object.values(selections).forEach((item) => {
      if (Array.isArray(item)) {
        item.forEach((product) => {
          if (product.weight) totalWeightGrams += product.weight;
        });
      } else if (item && item.weight) {
        totalWeightGrams += item.weight;
      }
    });

    console.log("Total weight (kg):", (totalWeightGrams / 1000).toFixed(2));
    const formData = this.getFormData();
    const store = formData.state === "WA" ? "linex" : "autospec";

    const lineItems = [];
    Object.values(selections).forEach((item) => {
      if (Array.isArray(item)) {
        item.forEach((product) => {
          const variantId = product.variantIdByStore?.[store];
          if (variantId) lineItems.push({ variant_id: variantId, quantity: 1 });
        });
      } else if (item) {
        const variantId = item.variantIdByStore?.[store];
        if (variantId) lineItems.push({ variant_id: variantId, quantity: 1 });
      }
    });

    if (lineItems.length === 0) {
      alert("No valid products selected (missing variant IDs).");
      return;
    }

    const draftOrderPayload = {
      draft_order: {
        line_items: lineItems,
        customer: {
          first_name: formData.firstName,
          last_name: formData.lastName,
          email: formData.email,
        },
        email: formData.email,
        note: `Quote From Builder\nName: ${formData.firstName} ${formData.lastName}\nPhone: ${formData.phone}\nNotes: ${formData.notes}`,
        tags: "quoteBuilder",
      },
      state: formData.state,
    };

    try {
      const response = await fetch(
        "https://workers-playground-autumn-tooth-f383.matt-skeoch.workers.dev/create-draft-order",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draftOrderPayload),
        }
      );

      if (!response.ok) throw new Error("Draft order creation failed");
      const data = await response.json();

      this.uiManager.displayConfirmationScreen(
        data.draft_order.name || data.draft_order.id,
        selections,
        totalPrice,
        formData
      );
    } catch (err) {
      console.error("Failed to create draft order:", err);
      alert("There was a problem submitting your quote. Please try again.");
    }
  }

  getFormData() {
    return {
      firstName: document.getElementById("customerFirstName")?.value.trim() || "",
      lastName: document.getElementById("customerLastName")?.value.trim() || "",
      email: document.getElementById("customerEmail")?.value.trim() || "",
      phone: document.getElementById("customerPhone")?.value.trim() || "",
      state: document.getElementById("customerState")?.value || "",
      notes: document.getElementById("customerNotes")?.value.trim() || "",
    };
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (typeof QUOTE_BUILDER_DATA !== "undefined" && QUOTE_BUILDER_DATA) {
    const app = new QuoteBuilderApp(QUOTE_BUILDER_DATA);
    app.init();
  } else {
    const container = document.getElementById("quoteBuilderStepsContainer");
    if (container) {
      container.innerHTML = '<p style="color:red;">Error: Quote builder data not loaded.</p>';
    }
  }
});
