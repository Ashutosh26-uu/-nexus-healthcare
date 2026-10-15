import { createContext, useContext } from 'react';

export const DoctorCtx = createContext(null);
export const useDoctorHome = () => useContext(DoctorCtx);
