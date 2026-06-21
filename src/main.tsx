import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import App from './App';
import { validateAppSearch } from './App';
import './styles.css';

const queryClient = new QueryClient();
const rootRoute = createRootRoute();
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: App,
  validateSearch: validateAppSearch,
});
const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute]) });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
