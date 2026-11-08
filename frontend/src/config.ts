/** Link de apoio ao projeto (Buy Me a Coffee, Stripe, PayPal etc.).
 *  Definido via URL_BUY_ME_A_COFFEE em frontend/.env (veja frontend/.env.example).
 *  Se a variável não estiver definida, usa o link padrão do Stripe do projeto.
 *  Se estiver definida mas vazia (URL_BUY_ME_A_COFFEE=), o botão não é exibido. */
export const BUY_ME_A_COFFEE_URL: string = (import.meta.env.URL_BUY_ME_A_COFFEE ?? 'https://buy.stripe.com/7sYcN7a5BdqVg1adWrcAo00').trim();
