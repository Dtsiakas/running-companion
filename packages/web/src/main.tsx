import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import './styles/tokens.css';
import './styles/global.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { ApiError } from './api/client.ts';
import { Layout } from './components/Layout.tsx';
import { LocaleGate } from './components/LocaleGate.tsx';
import { Body } from './routes/Body.tsx';
import { NotFound } from './routes/NotFound.tsx';
import { Settings } from './routes/Settings.tsx';
import { Progress } from './routes/Progress.tsx';
import { RouteError } from './routes/RouteError.tsx';
import { Run } from './routes/Run.tsx';
import { Sleep } from './routes/Sleep.tsx';
import { Runs } from './routes/Runs.tsx';
import { Today } from './routes/Today.tsx';
import { Trends } from './routes/Trends.tsx';
import { Week } from './routes/Week.tsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data changes a few times a day (syncs), so a minute of freshness avoids refetching on every screen switch.
      staleTime: 60_000,
      // Refresh when you come back to the app: the morning glance should show this morning's data.
      refetchOnWindowFocus: true,
      // Client errors (bad parameters, missing data) won't fix themselves by retrying.
      retry: (failures, error) => !(error instanceof ApiError && error.status < 500) && failures < 2,
    },
  },
});

const router = createBrowserRouter([
  {
    element: <Layout />,
    // If the layout itself fails, the error screen replaces everything.
    errorElement: <RouteError />,
    children: [
      {
        // A screen that fails shows the error screen inside the layout, so the navigation stays usable.
        errorElement: <RouteError />,
        children: [
          { path: '/', element: <Today /> },
          { path: '/week', element: <Week /> },
          { path: '/runs', element: <Runs /> },
          { path: '/runs/:id', element: <Run /> },
          { path: '/trends', element: <Trends /> },
          { path: '/sleep', element: <Sleep /> },
          { path: '/body', element: <Body /> },
          { path: '/progress', element: <Progress /> },
          { path: '/settings', element: <Settings /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LocaleGate>
        <RouterProvider router={router} />
      </LocaleGate>
    </QueryClientProvider>
  </StrictMode>,
);
