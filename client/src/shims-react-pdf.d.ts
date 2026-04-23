// react-pdf isn't installed; declare a permissive shim so the existing
// DataRoomDocumentViewer compiles until the real package is added.
declare module 'react-pdf' {
  import * as React from 'react';
  export const Document: React.ComponentType<any>;
  export const Page: React.ComponentType<any>;
  export const pdfjs: any;
}
