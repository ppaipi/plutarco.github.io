// Constants
const PERCENTAGE = 0.20; // 20%
const PAYMENT_PER_PERSON_PERCENTAGE = 0.10; // 10%
const PEOPLE_COUNT = 4; // número de personas para dividir

// Initialize month selector
function initializeMonthSelector() {
    const selector = document.getElementById('month-selector');
    if (!selector) return;

    // Get unique months from orders
    const months = [...new Set(currentOrders.map(order => {
        const date = new Date(order["Hora de envio"]);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }))].sort().reverse();

    // Populate selector
    selector.innerHTML = months.map(month => {
        const [year, monthNum] = month.split('-');
        const date = new Date(year, monthNum - 1, 1);
        const monthName = date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
        return `<option value="${month}">${monthName}</option>`;
    }).join('');

    // Initial calculation
    if (months.length) {
        calculateSummary(months[0]);
    }

    // Add change listener
    selector.onchange = (e) => calculateSummary(e.target.value);
}
const formateadorAR = new Intl.NumberFormat('es-AR', {
  style: 'decimal',
  maximumFractionDigits: 0, // Puedes ajustar el número de decimales
  useGrouping: true // Asegura que se use el separador de miles
});
// Calculate and display summary for selected month
function calculateSummary(monthYear) {
    // Filter orders for selected month
    const [year, month] = monthYear.split('-');
    const filteredOrders = currentOrders.filter(order => {
        const date = new Date(order["Hora de envio"]);
        return date.getFullYear() === parseInt(year) && 
               date.getMonth() === parseInt(month) - 1;
    });

    // Calculate totals
    const subtotal = filteredOrders.reduce((sum, order) => sum + (parseFloat(order.Subtotal) || 0), 0);
    const percentageAmount = subtotal * PERCENTAGE;
    const profit = subtotal - percentageAmount;

    const deliveryCharged = filteredOrders.reduce((sum, order) => sum + (parseFloat(order.Envio) || 0), 0);
    const deliveryCosts = filteredOrders.reduce((sum, order) => sum + (parseFloat(order["COSTO ENVIO"]) || 0), 0);
    const deliveryDifference = deliveryCharged - deliveryCosts;

    const paymentPerPerson = (subtotal * PAYMENT_PER_PERSON_PERCENTAGE);
    const deliveryDiffPerPerson = deliveryDifference / PEOPLE_COUNT;
    const totalPerPerson = paymentPerPerson + deliveryDiffPerPerson;

    const totalIncome = subtotal + deliveryCharged;
    const totalExpenses = deliveryCosts + percentageAmount;
    const finalBalance = totalIncome - totalExpenses;

    // Update UI
    updateValue('total-subtotal', formateadorAR.format(subtotal));
    updateValue('total-percentage', formateadorAR.format(percentageAmount));
    updateValue('total-profit', formateadorAR.format(profit));
    
    updateValue('delivery-charged', formateadorAR.format(deliveryCharged));
    updateValue('delivery-costs', formateadorAR.format(deliveryCosts));
    updateValue('delivery-difference', formateadorAR.format(deliveryDifference));
    
    updateValue('payment-per-person', formateadorAR.format(paymentPerPerson));
    updateValue('delivery-diff-per-person', formateadorAR.format(deliveryDiffPerPerson));
    updateValue('total-per-person', formateadorAR.format(totalPerPerson));
    
    updateValue('total-income', formateadorAR.format(totalIncome));
    updateValue('total-expenses', formateadorAR.format(totalExpenses));
    updateValue('final-balance', formateadorAR.format(finalBalance));
}

// Helper to update element with formatted value
function updateValue(id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = `$${value.toFixed(2)}`;
    }
}

// Initialize when orders are loaded
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem("logged")) {
        if (loginContainer) loginContainer.classList.add("hidden");
        if (panel) panel.classList.remove("hidden");
        loadOrders().then(() => {
            initializeMonthSelector();
        });
    }
});
