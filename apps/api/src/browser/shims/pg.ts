// En el navegador no hay `pg`; PGlite hace de motor. Solo hace falta que importarlo no falle.
const types = { setTypeParser() { /* no-op */ } };
class Pool {
  query(): never { throw new Error('pg no está disponible en el navegador'); }
  connect(): never { throw new Error('pg no está disponible en el navegador'); }
  end() { return Promise.resolve(); }
}
class Client extends Pool {}
export default { types, Pool, Client };
export { Pool, Client };
