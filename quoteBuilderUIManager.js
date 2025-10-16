(function () {
  const ENTER_KEYS = ['Enter', ' ', 'Spacebar'];

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
    const kg = grams / 1000;
    return `${kg.toFixed(1)} kg`;
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

  function buildCard({
    product,
    stepId,
    isSelected,
    disabled,
  }) {
    const buttonAttrs = [
      `class="qb-card__button"`,
      `type="button"`,
      `data-product-id="${product.id}"`,
      `data-step-id="${stepId}"`,
      disabled ? 'disabled' : '',
      `aria-pressed="${isSelected ? 'true' : 'false'}"`,
    ]
      .filter(Boolean)
      .join(' ');

    const classes = ['qb-card'];
    if (isSelected) classes.push('qb-card--selected');
    if (disabled) classes.push('qb-card--disabled');

    const priceText =
      typeof product.price === 'number' ? formatCurrency(product.price) : '';
    const weightText =
      typeof product.weight === 'number' ? formatWeight(product.weight) : '';
    const badge = product.stock
      ? `<span class="qb-card__badge">${escapeHtml(product.stock.replace('_', ' '))}</span>`
      : '';
    const detailsLink = product.handle
      ? `<a class="qb-card__link" href="/products/${product.handle}" target="_blank" rel="noopener" aria-label="View ${escapeHtml(
          product.name || product.title
        )} details in a new tab">View details</a>`
      : '';

    const metaParts = [];
    if (priceText) metaParts.push(`<span class="qb-card__price">${priceText}</span>`);
    if (weightText) metaParts.push(`<span class="qb-card__meta">${weightText}</span>`);

    const compatibilityMessage = disabled
      ? '<div class="qb-card__meta">Not available with your current vehicle.</div>'
      : '';

    const displayName = escapeHtml(product.name || product.title);
    const image = product.image
      ? `<img src="${product.image}" alt="${displayName}" loading="lazy">`
      : `<span>${displayName}</span>`;

    return `
      <article class="${classes.join(' ')}" data-product-id="${product.id}" data-step-id="${stepId}">
        ${badge}
        <button ${buttonAttrs}>
          <div class="qb-card__media">${image}</div>
          <div class="qb-card__body">
            <h3 class="qb-card__title">${displayName}</h3>
            ${compatibilityMessage}
            <div class="qb-card__footer">
              <div class="qb-card__meta-wrap">
                ${metaParts.join('')}
              </div>
              ${detailsLink}
            </div>
          </div>
        </button>
      </article>
    `;
  }

  function buildSummaryList(items) {
    if (!items || !items.length) {
      return '<p class="qb-summary__empty">Selections will appear here as you build.</p>';
    }
    return `
      <ul class="qb-summary__list">
        ${items
          .map(
            (item) => `
              <li class="qb-summary__item">
                <span class="qb-summary__item-label">${escapeHtml(item.label)}</span>
                <span>${escapeHtml(item.detail)}</span>
              </li>
            `
          )
          .join('')}
      </ul>
    `;
  }

  class QuoteBuilderUIManager {
    constructor(handlers = {}) {
      this.root = document.getElementById('quoteBuilderApp');
      this.main = document.getElementById('quoteBuilderMain');
      this.summary = document.getElementById('quoteBuilderSummary');
      this.progress = document.getElementById('quoteBuilderProgress');
      this.restartButton = document.getElementById('quoteBuilderRestartButton');
      this.confirmation = document.getElementById('quoteBuilderConfirmation');
      this.handlers = {
        onToggleProduct: handlers.onToggleProduct || function noop() {},
        onNext: handlers.onNext || function noop() {},
        onPrevious: handlers.onPrevious || function noop() {},
        onJumpToStep: handlers.onJumpToStep || function noop() {},
        onRestart: handlers.onRestart || function noop() {},
        onSubmit: handlers.onSubmit || function noop() {},
        onFormChange: handlers.onFormChange || function noop() {},
        onFieldBlur: handlers.onFieldBlur || function noop() {},
        onEmptyStateBack: handlers.onEmptyStateBack || function noop() {},
        onVehicleMakeChange: handlers.onVehicleMakeChange || function noop() {},
        onVehicleModelChange: handlers.onVehicleModelChange || function noop() {},
        onVehicleYearChange: handlers.onVehicleYearChange || function noop() {},
      };

      this.activeStepId = null;
      this.submissionState = { status: 'idle', message: '' };

      this.bindEvents();
    }

    setHandlers(handlers) {
      this.handlers = {
        ...this.handlers,
        ...handlers,
      };
    }

    bindEvents() {
      if (this.restartButton) {
        this.restartButton.addEventListener('click', () => {
          this.handlers.onRestart();
        });
      }

      if (this.progress) {
        this.progress.addEventListener('click', (event) => {
          const button = event.target.closest('[data-progress-index]');
          if (!button) return;
          const index = Number(button.dataset.progressIndex);
          if (Number.isNaN(index)) return;
          this.handlers.onJumpToStep(index);
        });
      }

      if (this.main) {
        this.main.addEventListener('click', (event) => {
          const button = event.target.closest('.qb-card__button');
          if (button && !button.disabled) {
            const { productId, stepId } = button.dataset;
            this.handlers.onToggleProduct(stepId, productId);
          }

          const navButton = event.target.closest('[data-nav-action]');
          if (navButton) {
            const action = navButton.dataset.navAction;
            if (action === 'next') {
              this.handlers.onNext();
            } else if (action === 'previous') {
              this.handlers.onPrevious();
            } else if (action === 'submit') {
              this.handlers.onSubmit();
            } else if (action === 'empty-back') {
              this.handlers.onEmptyStateBack();
            }
          }
        });

        this.main.addEventListener('keydown', (event) => {
          if (!ENTER_KEYS.includes(event.key)) return;
          const card = event.target.closest('.qb-card__button');
          if (card && !card.disabled) {
            event.preventDefault();
            const { productId, stepId } = card.dataset;
            this.handlers.onToggleProduct(stepId, productId);
          }
        });

        this.main.addEventListener(
          'change',
          (event) => {
            const vehicleSelect = event.target.closest('[data-vehicle-select]');
            if (vehicleSelect) {
              const type = vehicleSelect.dataset.vehicleSelect;
              const value = vehicleSelect.value;
              if (type === 'make') {
                this.handlers.onVehicleMakeChange(value);
              } else if (type === 'model') {
                this.handlers.onVehicleModelChange(value);
              } else if (type === 'year') {
                this.handlers.onVehicleYearChange(value);
              }
              return;
            }
            const field = event.target.closest('[data-field-id]');
            if (!field) return;
            const { fieldId } = field.dataset;
            this.handlers.onFormChange(fieldId, field.value);
          },
          true
        );

        this.main.addEventListener(
          'blur',
          (event) => {
            const field = event.target.closest('[data-field-id]');
            if (!field) return;
            const { fieldId } = field.dataset;
            this.handlers.onFieldBlur(fieldId);
          },
          true
        );
      }
    }

    setSubmissionState(state) {
      this.submissionState = { ...state };
    }

    renderProgress(progressState) {
      if (!this.progress || !progressState) return;
      const { steps, activeIndex } = progressState;
      const listItems = steps
        .map((step, index) => {
          const isActive = index === activeIndex;
          const statusLabel = step.status === 'complete' ? 'Complete' : 'Incomplete';
          const title = escapeHtml(step.title);
          return `
            <li>
              <button
                type="button"
                class="qb__progress-button"
                data-progress-index="${index}"
                aria-current="${isActive ? 'step' : 'false'}"
                aria-label="${title} (${statusLabel})"
              >
                <span class="qb__progress-index">${index + 1}</span>
                <span>${title}</span>
              </button>
            </li>
          `;
        })
        .join('');
      this.progress.innerHTML = `<ol>${listItems}</ol>`;
    }

    renderSummary(summaryState) {
      if (!this.summary || !summaryState) return;
      const { items, totalPrice, storeLabel } = summaryState;
      const summaryItems = buildSummaryList(items);
      const totals = `
        <div class="qb-summary__totals">
          <div><strong>Total</strong>: ${
            typeof totalPrice === 'number' ? formatCurrency(totalPrice) : '—'
          }</div>
        </div>
      `;
      this.summary.innerHTML = `
        <div class="qb-summary__header">
          <h2 class="qb-summary__title">Your build</h2>
          <div class="qb-summary__store">Pricing based on ${escapeHtml(storeLabel)}</div>
        </div>
        ${summaryItems}
        ${totals}
      `;
    }

    renderForm(step, formState) {
      const { values, errors } = formState;
      const fieldsHtml = (step.fields || [])
        .map((field) => {
          const value = values[field.id] || '';
          const error = errors[field.id];
          const attrs = [
            `id="qb-field-${field.id}"`,
            `name="${field.id}"`,
            `data-field-id="${field.id}"`,
            field.autocomplete ? `autocomplete="${field.autocomplete}"` : '',
            field.maxlength ? `maxlength="${field.maxlength}"` : '',
            field.required ? 'required' : '',
            field.required ? 'aria-required="true"' : '',
            error ? 'aria-invalid="true"' : '',
          ].filter(Boolean);

          let control = '';
          if (field.type === 'textarea') {
            control = `<textarea ${attrs.join(' ')} rows="4">${escapeHtml(value)}</textarea>`;
          } else if (field.type === 'select') {
            const options = ['<option value="">Select...</option>']
              .concat(
                (field.options || []).map((option) => {
                  const selected = option === value ? 'selected' : '';
                  return `<option value="${escapeHtml(option)}" ${selected}>${escapeHtml(option)}</option>`;
                })
              )
              .join('');
            control = `<select ${attrs.join(' ')}>${options}</select>`;
          } else {
            const typeAttr = field.type || 'text';
            control = `<input type="${typeAttr}" ${attrs.join(' ')} value="${escapeHtml(value)}" />`;
          }

          return `
            <div class="qb-field ${error ? 'qb-field--error' : ''}">
              <label for="qb-field-${field.id}">${escapeHtml(field.label)}${
            field.required ? ' *' : ''
          }</label>
              ${control}
              ${
                error
                  ? `<div class="qb-field__error" role="alert">${escapeHtml(error)}</div>`
                  : ''
              }
            </div>
          `;
        })
        .join('');

      return `<form class="qb-form" novalidate>${fieldsHtml}</form>`;
    }

    renderVehicleSelectors(options, selection) {
      const vehicleOptions = options || {};
      const vehicleSelection = selection || {};
      const { makes = [], modelsByMake = {}, yearsByMakeModel = {} } = vehicleOptions;
      const selectedMake = vehicleSelection.make || '';
      const selectedModel = vehicleSelection.model || '';
      const selectedYear = vehicleSelection.year || '';

      const models = selectedMake ? modelsByMake[selectedMake] || [] : [];
      const yearsKey = `${selectedMake}|||${selectedModel}`;
      const years = selectedMake && selectedModel ? yearsByMakeModel[yearsKey] || [] : [];
      const modelDisabled = !selectedMake || models.length === 0;
      const yearDisabled = !selectedMake || !selectedModel || years.length === 0;

      const makeOptions = ['<option value="">Select make…</option>']
        .concat(
          makes.map((make) => {
            const selected = make === selectedMake ? 'selected' : '';
            return `<option value="${escapeHtml(make)}" ${selected}>${escapeHtml(make)}</option>`;
          })
        )
        .join('');

      const modelOptions = ['<option value="">Select model…</option>']
        .concat(
          models.map((model) => {
            const selected = model === selectedModel ? 'selected' : '';
            return `<option value="${escapeHtml(model)}" ${selected}>${escapeHtml(model)}</option>`;
          })
        )
        .join('');

      const yearOptions = ['<option value="">Select year…</option>']
        .concat(
          years.map((year) => {
            const selected = year === selectedYear ? 'selected' : '';
            return `<option value="${escapeHtml(year)}" ${selected}>${escapeHtml(year)}</option>`;
          })
        )
        .join('');

      return `
        <div class="qb-vehicle">
          <div class="qb-field">
            <label for="qb-vehicle-make">Make *</label>
            <select id="qb-vehicle-make" data-vehicle-select="make" aria-required="true">${makeOptions}</select>
          </div>
          <div class="qb-field">
            <label for="qb-vehicle-model">Model *</label>
            <select id="qb-vehicle-model" data-vehicle-select="model" aria-required="true" ${
              modelDisabled ? 'disabled' : ''
            }>${modelOptions}</select>
          </div>
          <div class="qb-field">
            <label for="qb-vehicle-year">Year *</label>
            <select id="qb-vehicle-year" data-vehicle-select="year" aria-required="true" ${
              yearDisabled ? 'disabled' : ''
            }>${yearOptions}</select>
          </div>
        </div>
      `;
    }

    renderStep(stepState, formState) {
      if (!this.main || !stepState) return;
      const {
        step,
        products,
        selectedProductIds,
        helperText,
        isEmpty,
        vehicleOptions,
        vehicleSelection,
      } = stepState;
      this.activeStepId = step?.id || null;

      const header = step
        ? `
          <header class="qb-step__header">
            <h1 class="qb-step__title">${escapeHtml(step.title)}</h1>
            ${
              step.description
                ? `<p class="qb-step__description">${escapeHtml(step.description)}</p>`
                : ''
            }
          </header>
        `
        : '';

      let content = '';
      if (!step) {
        content = '<p>No steps available.</p>';
      } else if (step.id === 'vehicle_select') {
        content = this.renderVehicleSelectors(vehicleOptions, vehicleSelection);
      } else if (step.renderType === 'form') {
        content = this.renderForm(step, formState);
      } else if (isEmpty) {
        content = `
          <div class="qb-step__empty">
            <div>There are no items available for this step based on your current selections.</div>
            <button type="button" class="qb-button qb-button--secondary" data-nav-action="empty-back">Go back</button>
          </div>
        `;
      } else {
        const cards = [];
        (products.compatible || []).forEach((product) => {
          cards.push(
            buildCard({
              product,
              stepId: step.id,
              isSelected: selectedProductIds.includes(product.id),
              disabled: false,
            })
          );
        });
        (products.incompatible || []).forEach((product) => {
          cards.push(
            buildCard({
              product,
              stepId: step.id,
              isSelected: false,
              disabled: true,
            })
          );
        });
        content = `<div class="qb-grid">${cards.join('')}</div>`;
      }

      this.main.innerHTML = `
        <div class="qb-step" data-step-id="${step?.id || ''}">
          ${header}
          ${content}
        </div>
        ${
          helperText
            ? `<div class="qb-nav__helper" data-step-helper="true" role="status">${escapeHtml(helperText)}</div>`
            : ''
        }
      `;
    }

    renderNavigation(navState) {
      if (!this.main || !navState) return;
      const navHtml = `
        <div class="qb-nav">
          <button
            type="button"
            class="qb-button qb-button--secondary"
            data-nav-action="previous"
            ${navState.canGoPrevious ? '' : 'disabled'}
          >Back</button>
          <div class="qb-nav__actions">
            ${navState.isLastStep
              ? `<button type="button" class="qb-button qb-button--primary" data-nav-action="submit" ${
                  navState.nextDisabled ? 'disabled' : ''
                }>${navState.submitLabel || 'Submit quote'}</button>`
              : `<button type="button" class="qb-button qb-button--primary" data-nav-action="next" ${
                  navState.nextDisabled ? 'disabled' : ''
                }>${navState.nextLabel || 'Next step'}</button>`}
          </div>
        </div>
        ${
          navState.blockingMessage
            ? `<div class="qb-nav__helper" data-nav-helper="true" role="status">${escapeHtml(
                navState.blockingMessage
              )}</div>`
            : ''
        }
      `;

      const existingNav = this.main.querySelector('.qb-nav');
      if (existingNav) {
        existingNav.remove();
      }
      const existingHelper = this.main.querySelector('[data-nav-helper="true"]');
      if (existingHelper) {
        existingHelper.remove();
      }

      const navWrapper = document.createElement('div');
      navWrapper.innerHTML = navHtml;
      Array.from(navWrapper.children).forEach((child) => {
        this.main.appendChild(child);
      });
    }

    renderStatus(status) {
      if (!this.main) return;
      const existing = this.main.querySelector('.qb-status');
      if (existing) {
        existing.remove();
      }
      if (!status || !status.message) return;
      const message = document.createElement('div');
      message.className = `qb-status qb-status--${status.status}`;
      message.setAttribute('role', status.status === 'error' ? 'alert' : 'status');
      message.textContent = status.message;
      this.main.appendChild(message);
    }

    showConfirmation(confirmationState) {
      if (!this.confirmation || !confirmationState) return;
      const { heading, message, summaryHtml, emailMarkup, orderUrl } = confirmationState;
      const headingText = escapeHtml(heading || 'Quote submitted');
      const messageText = escapeHtml(message || 'Thanks for building with Autospec 4x4.');
      const orderLink = orderUrl
        ? `<a class="qb-button qb-button--primary" href="${escapeHtml(orderUrl)}" target="_blank" rel="noopener">View draft order</a>`
        : '';
      this.confirmation.innerHTML = `
        <div class="qb-confirmation__wrap">
          <div>
            <h2>${headingText}</h2>
            <p>${messageText}</p>
          </div>
          <div>${summaryHtml || ''}</div>
          <div class="qb-confirmation__actions">
            ${orderLink}
            <button type="button" class="qb-button qb-button--secondary" data-nav-action="previous">Back to builder</button>
          </div>
          <div>
            <h3>Email summary</h3>
            <div class="qb-email-block">${emailMarkup || ''}</div>
          </div>
        </div>
      `;
      this.confirmation.hidden = false;
      this.root.setAttribute('data-view', 'confirmation');
    }

    hideConfirmation() {
      if (!this.confirmation) return;
      this.confirmation.hidden = true;
      this.confirmation.innerHTML = '';
      this.root.removeAttribute('data-view');
    }

    render(state) {
      if (!state) return;
      if (state.confirmation && state.confirmation.visible) {
        this.showConfirmation(state.confirmation);
      } else {
        this.hideConfirmation();
        this.renderProgress(state.progress);
        this.renderSummary(state.summary);
        this.renderStep(state.step, state.form);
        this.renderNavigation(state.navigation);
        this.renderStatus(state.status);
      }
    }
  }

  window.QuoteBuilderUIManager = QuoteBuilderUIManager;
})();
