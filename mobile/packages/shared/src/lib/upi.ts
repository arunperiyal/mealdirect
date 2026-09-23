// A UPI payment link (NPCI "upi://pay" format) for the exact order amount.
// Shown as a QR code the customer scans with any UPI app.
export const upiPayUrl = (payee: { id: string; name: string }, amount: number, reference: string) => {
  const params = [
    ['pa', payee.id],
    ['pn', payee.name],
    ['am', amount.toFixed(2)],
    ['cu', 'INR'],
    ['tn', `MealDirect order ${reference}`],
  ];
  return `upi://pay?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
};
