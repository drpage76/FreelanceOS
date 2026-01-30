
import { getSupabase } from './db';

/**
 * Initiates the Stripe Checkout process by calling the Supabase Edge Function.
 * It redirects the user to the Stripe-hosted checkout page.
 */
export const startStripeCheckout = async (email: string) => {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud connection not established.");

  // This calls your Supabase Edge Function
  // You must deploy the function 'create-checkout-session' first
  const { data, error } = await supabase.functions.invoke('create-checkout-session', {
    body: { email }
  });

  if (error) {
    console.error("Stripe Handoff Error:", error);
    throw new Error(error.message || "Failed to initialize secure checkout.");
  }

  if (data?.url) {
    // Redirect the user to Stripe Checkout
    window.location.href = data.url;
  } else {
    throw new Error("Stripe did not return a valid checkout URL.");
  }
};

/**
 * Opens the Stripe Customer Portal so users can manage their subscription/cards.
 */
export const openStripePortal = async (email: string) => {
  const supabase = getSupabase();
  if (!supabase) return;

  const { data, error } = await supabase.functions.invoke('create-portal-link', {
    body: { email }
  });

  if (data?.url) {
    window.location.href = data.url;
  } else {
    alert("Stripe Portal is unavailable. Please try again later.");
  }
};
