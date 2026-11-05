import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cartApi, getCartError } from "./cart.api";
import type { Cart } from "./cart.types";
import { useAuth } from "../auth/auth.hooks";

type CartContextValue = {
  cart: Cart | null;
  itemCount: number;
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  refreshCart: () => Promise<void>;
  addItem: (productId: string, quantity?: number) => Promise<Cart>;
  updateItem: (itemId: string, quantity: number) => Promise<Cart>;
  removeItem: (itemId: string) => Promise<Cart>;
  clearCart: () => Promise<Cart>;
};

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const [cart, setCart] = useState<Cart | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshCart = useCallback(async () => {
    if (isAuthLoading) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      setCart(await cartApi.getCart());
    } catch (requestError) {
      setError(getCartError(requestError));
    } finally {
      setIsLoading(false);
    }
  }, [isAuthLoading]);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    let cancelled = false;

    async function loadCart() {
      setIsLoading(true);
      setError(null);

      try {
        const nextCart = await cartApi.getCart();

        if (!cancelled) {
          setCart(nextCart);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(getCartError(requestError));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadCart();

    return () => {
      cancelled = true;
    };
  }, [isAuthLoading, isAuthenticated]);

  const addItem = useCallback(
    async (productId: string, quantity = 1) => {
      setIsMutating(true);
      setError(null);

      try {
        const nextCart = await cartApi.addItem(productId, quantity);
        setCart(nextCart);
        return nextCart;
      } catch (requestError) {
        setError(getCartError(requestError));
        throw requestError;
      } finally {
        setIsMutating(false);
      }
    },
    [],
  );

  const updateItem = useCallback(
    async (itemId: string, quantity: number) => {
      setIsMutating(true);
      setError(null);

      try {
        const nextCart = await cartApi.updateItem(itemId, quantity);
        setCart(nextCart);
        return nextCart;
      } catch (requestError) {
        setError(getCartError(requestError));
        throw requestError;
      } finally {
        setIsMutating(false);
      }
    },
    [],
  );

  const removeItem = useCallback(
    async (itemId: string) => {
      setIsMutating(true);
      setError(null);

      try {
        const nextCart = await cartApi.removeItem(itemId);
        setCart(nextCart);
        return nextCart;
      } catch (requestError) {
        setError(getCartError(requestError));
        throw requestError;
      } finally {
        setIsMutating(false);
      }
    },
    [],
  );

  const clearCart = useCallback(async () => {
    setIsMutating(true);
    setError(null);

    try {
      const nextCart = await cartApi.clearCart();
      setCart(nextCart);
      return nextCart;
    } catch (requestError) {
      setError(getCartError(requestError));
      throw requestError;
    } finally {
      setIsMutating(false);
    }
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      itemCount: cart?.itemCount ?? 0,
      isLoading,
      isMutating,
      error,
      refreshCart,
      addItem,
      updateItem,
      removeItem,
      clearCart,
    }),
    [
      cart,
      isLoading,
      isMutating,
      error,
      refreshCart,
      addItem,
      updateItem,
      removeItem,
      clearCart,
    ],
  );

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }

  return context;
}
