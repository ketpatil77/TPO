document.addEventListener('DOMContentLoaded', () => {
    // If token already present, attempt redirect to dashboard
    verifySession();

    const loginForm = document.getElementById('loginForm');
    loginForm.addEventListener('submit', handleLogin);
});

function fillDemo(prn, dob) {
    document.getElementById('prn').value = prn;
    document.getElementById('dob').value = dob;
}

async function handleLogin(e) {
    e.preventDefault();

    const prnInput = document.getElementById('prn');
    const dobInput = document.getElementById('dob');
    const submitBtn = document.getElementById('submitBtn');
    const alertBox = document.getElementById('alertBox');

    const prn = prnInput.value.trim();
    const dob = dobInput.value.trim();

    if (!prn || !dob) {
        showAlert('Please enter both PRN and Date of Birth password.');
        return;
    }

    if (dob.length !== 6 || isNaN(dob)) {
        showAlert('Date of birth password must be 6 digits in DDMMYY format (e.g. 310703).');
        return;
    }

    // Disable button & show loading
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Signing in...';
    hideAlert();

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prn, dob })
        });

        const data = await response.json();

        if (data.success) {
            showToast('Login successful! Redirecting...', 'success');
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 700);
        } else {
            showAlert(apiError(data));
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Sign In to Portal →';
        }
    } catch (err) {
        console.error('Login error:', err);
        showAlert('Network error or server unavailable. Please try again.');
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Sign In to Portal →';
    }
}

async function verifySession() {
    try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (data.success) {
            window.location.href = '/dashboard';
        }
    } catch (err) {
        // No active cookie session.
    }
}

function showAlert(msg) {
    const alertBox = document.getElementById('alertBox');
    alertBox.style.display = 'block';
    alertBox.innerHTML = `
        <div style="padding: 0.75rem 1rem; border-radius: 8px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5; font-size: 0.875rem;">
            ⚠️ ${msg}
        </div>
    `;
}

function hideAlert() {
    const alertBox = document.getElementById('alertBox');
    alertBox.style.display = 'none';
}

function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${type === 'success' ? '✅' : 'ℹ️'}</span> ${msg}`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}
