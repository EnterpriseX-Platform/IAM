import React from 'react';

export const metadata = {
  title: 'Schema Explorer - IAM',
  description: 'Database Schema Explorer for IAM',
};

export default function App2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
    </>
  );
}
