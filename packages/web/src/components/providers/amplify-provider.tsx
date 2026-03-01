'use client';

import { useEffect } from 'react';
import { Amplify } from 'aws-amplify';

const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || 'us-east-1_gBsGtRPnM',
      userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '3vhh0artoakoardoi4e9rdm3m9',
      loginWith: {
        email: true,
        username: false,
        phone: false,
      },
      signUpVerificationMethod: 'code' as const,
    },
  },
};

export function AmplifyProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    Amplify.configure(amplifyConfig);
  }, []);

  return <>{children}</>;
}
