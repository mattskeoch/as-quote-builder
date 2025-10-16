class QuoteBuilderUIManager {
  constructor(selectionManager) {
    this.selectionManager = selectionManager;
    this.stepsContainer = document.getElementById('quoteBuilderStepsContainer');
    this.summaryTotalPriceValue = document.getElementById('quoteBuilderSummaryTotalPriceValue');
    this.progressBarFill = document.getElementById('quoteBuilderProgressBarFill');
    this.stepCounter = document.getElementById('quoteBuilderStepCounter');
    this.runningTotalEl = document.getElementById('quoteBuilderRunningTotal');

    if (!this.stepsContainer) console.error('[UI] Constructor: quoteBuilderStepsContainer not found!');
  }

  /* -------- VEHICLE FORM (custom renderType) -------- */
  renderVehicleSelectForm() {
    const container = document.createElement('div');
    container.classList.add('vehicle-form');

    const makeSelect = document.createElement('select');
    const modelSelect = document.createElement('select');
    const yearSelect = document.createElement('select');

    makeSelect.innerHTML = `<option value="">Select Make</option>`;
    modelSelect.innerHTML = `<option value="">Select Model</option>`;
    yearSelect.innerHTML = `<option value="">Select Year</option>`;

    const vehicleProducts = QUOTE_BUILDER_DATA.products.filter(p => p.stepId === 'vehicle_select');

    const makeMap = {};
    vehicleProducts.forEach(p => {
      if (!p.make || !p.model) return;
      const make = p.make;
      const model = p.model;
      if (!makeMap[make]) makeMap[make] = new Set();
      makeMap[make].add(model);
    });

    // Populate make dropdown
    Object.keys(makeMap).forEach(make => {
      const option = document.createElement('option');
      option.value = make;
      option.textContent = make;
      makeSelect.appendChild(option);
    });

    // On make change, populate model dropdown
    makeSelect.addEventListener('change', () => {
      modelSelect.innerHTML = `<option value="">Select Model</option>`;
      yearSelect.innerHTML = `<option value="">Select Year</option>`;
      const selectedMake = makeSelect.value;
      if (selectedMake) {
        makeMap[selectedMake].forEach(model => {
          const option = document.createElement('option');
          option.value = model;
          option.textContent = model;
          modelSelect.appendChild(option);
        });
      }
    });

    // On model change, populate static year dropdown
    modelSelect.addEventListener('change', () => {
      yearSelect.innerHTML = `<option value="">Select Year</option>`;
      for (let y = 2025; y >= 2010; y--) {
        const option = document.createElement('option');
        option.value = y;
        option.textContent = y;
        yearSelect.appendChild(option);
      }
    });

    // On year selection, store combined data (keep original product.id for compatibility)
    yearSelect.addEventListener('change', () => {
      const selectedMake = makeSelect.value;
      const selectedModel = modelSelect.value;
      const selectedYear = yearSelect.value;

      if (selectedMake && selectedModel && selectedYear) {
        const matchedProduct = QUOTE_BUILDER_DATA.products.find(
          p => p.stepId === 'vehicle_select' &&
            p.make?.toLowerCase() === selectedMake.toLowerCase() &&
            p.model?.toLowerCase() === selectedModel.toLowerCase()
        );

        if (matchedProduct) {
          const enrichedProduct = {
            ...matchedProduct,
            make: selectedMake,
            model: selectedModel,
            year: selectedYear
          };
          this.selectionManager.select('vehicle_select', enrichedProduct);
        } else {
          this.selectionManager.clearSelection?.('vehicle_select');
        }

        document.dispatchEvent(new CustomEvent('quoteBuilder:selectionUpdated'));
      }
    });

    container.appendChild(makeSelect);
    container.appendChild(modelSelect);
    container.appendChild(yearSelect);
    return container;
  }

  /* -------- GENERIC RENDER -------- */
  renderStep(step, productsForStep, currentSelections) {
    const stepElement = document.createElement('div');
    stepElement.className = 'quote-builder-step';
    stepElement.dataset.stepId = step.id;

    const titleElement = document.createElement('h2');
    titleElement.className = 'step-title';
    titleElement.textContent = step.title;
    stepElement.appendChild(titleElement);

    if (step.subtitle) {
      const subtitleEl = document.createElement('p');
      subtitleEl.className = 'step-subtitle';
      subtitleEl.textContent = step.subtitle;
      stepElement.appendChild(subtitleEl);
    }

    const renderType = step.renderType || 'options-grid';

    if (renderType === 'vehicle-form') {
      const vehicleForm = this.renderVehicleSelectForm();
      stepElement.appendChild(vehicleForm);

    } else if (renderType === 'dropdown') {
      const selectWrapper = document.createElement('div');
      selectWrapper.className = 'vehicle-select-wrapper';

      const selectEl = document.createElement('select');
      selectEl.className = 'vehicle-select-dropdown';
      selectEl.dataset.stepId = step.id;

      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'Please select...';
      selectEl.appendChild(defaultOption);

      productsForStep.forEach(product => {
        const optionEl = document.createElement('option');
        optionEl.value = product.id;
        optionEl.textContent = product.name || product.title || product.id;
        if (currentSelections[step.id]?.id === product.id) {
          optionEl.selected = true;
        }
        selectEl.appendChild(optionEl);
      });

      selectWrapper.appendChild(selectEl);
      stepElement.appendChild(selectWrapper);

    } else if (renderType === 'form') {
      const form = document.createElement('form');
      form.id = 'quoteCustomerForm';

      const fields = Array.isArray(step.fields) ? step.fields : [];

      fields.forEach(f => {
        form.appendChild(
          this.createInput(f.label, f.type || 'text', f.id, !!f.required, f.options || [])
        );
      });

      stepElement.appendChild(form);

    } else {
      // options-grid (default)
      const optionsGrid = document.createElement('div');
      optionsGrid.className = 'options-grid';

      productsForStep.forEach(product => {
        const card = this.createProductCard(product, currentSelections, step.id, step.selectionMode);
        optionsGrid.appendChild(card);
      });

      stepElement.appendChild(optionsGrid);
    }

    return stepElement;
  }

  createInput(labelText, type, id, required, options = []) {
    const wrapper = document.createElement('div');
    wrapper.className = 'input-wrapper';

    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = labelText;

    let input;
    if (type === 'textarea') {
      input = document.createElement('textarea');
    } else if (type === 'select') {
      input = document.createElement('select');
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Select...';
      input.appendChild(placeholder);
      options.forEach(val => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = val;
        input.appendChild(opt);
      });
    } else {
      input = document.createElement('input');
      input.type = type;
    }

    input.id = id;
    input.required = required;

    wrapper.appendChild(label);
    wrapper.appendChild(input);

    return wrapper;
  }

  createProductCard(product, currentSelections, stepId, selectionMode) {
    const isSelected = selectionMode === 'multiple'
      ? (Array.isArray(currentSelections[stepId]) && currentSelections[stepId].some(p => p.id === product.id))
      : (currentSelections[stepId]?.id === product.id);

    const card = document.createElement('div');
    card.className = 'option-card';
    card.dataset.productId = product.id;
    card.dataset.stepId = stepId;
    if (isSelected) card.classList.add('selected');

    const img = document.createElement('img');
    img.src = product.image || 'https://placehold.co/600x400?text=Autospec+4x4';
    img.alt = product.name || product.title || 'Product';
    card.appendChild(img);

    const nameEl = document.createElement('div');
    nameEl.className = 'option-name';
    nameEl.textContent = product.name || product.title || product.id;
    card.appendChild(nameEl);

    if (product.handle) {
      const viewLink = document.createElement('a');
      viewLink.href = `/products/${product.handle}`;
      viewLink.textContent = 'View details';
      viewLink.target = '_blank';
      viewLink.style.display = 'block';
      viewLink.style.fontSize = '12px';
      viewLink.style.marginTop = '4px';
      viewLink.style.color = '#b0101d';
      nameEl.appendChild(viewLink);
    }

    if (product.price && product.price > 0) {
      const priceEl = document.createElement('div');
      priceEl.className = 'option-price';
      priceEl.textContent = `$${product.price.toFixed(2)}`;
      card.appendChild(priceEl);
    }

    const selectButton = document.createElement('button');
    selectButton.className = 'option-select-button';
    selectButton.textContent =
      isSelected
        ? (selectionMode === 'multiple' ? 'Remove' : 'Selected')
        : (selectionMode === 'multiple' ? 'Add' : 'Select');
    selectButton.dataset.productId = product.id;
    card.appendChild(selectButton);

    return card;
  }

  updateRunningTotalOnly(totalPrice) {
    if (this.runningTotalEl) {
      this.runningTotalEl.textContent = `Total: $${totalPrice.toFixed(2)}`;
    }
  }

  updateNavigationButtons(showPrev, showNext, showQuote, nextEnabled) {
    const prevBtn = document.getElementById('quoteBuilderPrevStepButton');
    const nextBtn = document.getElementById('quoteBuilderNextStepButton');
    const quoteBtn = document.getElementById('quoteBuilderGetQuoteButtonMain');

    if (prevBtn) prevBtn.style.display = showPrev ? 'inline-block' : 'none';
    if (nextBtn) {
      nextBtn.style.display = showNext ? 'inline-block' : 'none';
      nextBtn.disabled = !nextEnabled;
    }
    if (quoteBtn) quoteBtn.style.display = showQuote ? 'inline-block' : 'none';
  }

  updateProgress(currentStepDisplayIndex, totalDisplaySteps) {
    if (!this.progressBarFill || !this.stepCounter) return;
    const percent = totalDisplaySteps > 1 ? ((currentStepDisplayIndex - 1) / (totalDisplaySteps - 1)) * 100 : 100;
    this.progressBarFill.style.width = `${percent}%`;
    this.stepCounter.textContent = `Step ${currentStepDisplayIndex} / ${totalDisplaySteps}`;
  }

  displayConfirmationScreen(quoteId, selections, totalPrice, formData) {
    const quoteButton = document.getElementById('quoteBuilderGetQuoteButtonMain');
    if (quoteButton) quoteButton.style.display = 'none';

    const stepsHtml = Object.entries(selections).map(([stepId, selected]) => {
      if (Array.isArray(selected)) {
        return selected.map(product => `
          <div class="summary-item">
            <div class="summary-item-name">${product.name || product.title}</div>
            <div class="summary-item-price">$${(product.price || 0).toFixed(2)}</div>
          </div>
        `).join('');
      } else if (selected) {
        return `
          <div class="summary-item">
            <div class="summary-item-name">${selected.name || selected.title}</div>
            <div class="summary-item-price">$${(selected.price || 0).toFixed(2)}</div>
          </div>
        `;
      }
      return '';
    }).join('');

    const customerHtml = `
      <div class="summary-customer">
        <h4>Customer Details</h4>
        <p><strong>First Name:</strong> ${formData.firstName}</p>
        <p><strong>Last Name:</strong> ${formData.lastName}</p>
        <p><strong>Email:</strong> ${formData.email}</p>
        <p><strong>Phone:</strong> ${formData.phone}</p>
        <p><strong>State:</strong> ${formData.state}</p>
        <p><strong>Notes:</strong> ${formData.notes}</p>
      </div>
    `;

    this.stepsContainer.innerHTML = `
      <div class="quote-confirmation">
        <h2>Thank you for your quote request!</h2>
        <p>Your quote reference is: <strong>${quoteId}</strong></p>

        <div class="summary-section">
          <h3>Your Quote Summary</h3>
          <div class="summary-items">${stepsHtml}</div>
          <div class="summary-footer">
            <div class="summary-total">Total: <span>$${totalPrice.toFixed(2)}</span></div>
          </div>
          ${customerHtml}
        </div>

        <div style="margin-top: 30px;">
          <a class="button" href="/">Return Home</a>
          <a class="button" href="/pages/quote-builder">Start Another Quote</a>
        </div>
      </div>
    `;
  }

  updateFinalSummary(selections, totalPrice) {
    const summaryDiv = document.querySelector('.quote-builder-summary-final');
    const selectionsDiv = document.getElementById('quoteBuilderFinalSelections');
    const priceEl = document.getElementById('quoteBuilderFinalTotalPrice');

    if (summaryDiv && selectionsDiv && priceEl) {
      selectionsDiv.innerHTML = '';

      Object.values(selections).forEach(item => {
        if (item) {
          const itemEl = document.createElement('div');
          itemEl.textContent = `${item.name || item.title} - $${(item.price || 0).toFixed(2)}`;
          selectionsDiv.appendChild(itemEl);
        }
      });

      priceEl.textContent = `$${totalPrice.toFixed(2)}`;
      summaryDiv.style.display = 'block';
    }
  }
}
