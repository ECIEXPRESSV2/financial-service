/**
 * Token de inyección del ServiceBusClient compartido. Vive en su propio archivo para
 * evitar el ciclo de imports módulo ↔ publisher (el módulo importa el publisher y el
 * publisher importaba el token desde el módulo → CircularDependencyException de Nest).
 */
export const SERVICE_BUS_CLIENT = Symbol('SERVICE_BUS_CLIENT');
