/** Link de apoio ao projeto (Buy Me a Coffee, Stripe, PayPal etc.).
 *  Definido via URL_BUY_ME_A_COFFEE em frontend/.env (veja frontend/.env.example).
 *  Se vazio, o botão não é exibido. */
export const BUY_ME_A_COFFEE_URL: string = (import.meta.env.URL_BUY_ME_A_COFFEE ?? '').trim();
