# Magnate

Juego de mesa de comprar barrios y cobrar renta, para jugar online con amigos.

**Jugar:** https://adrianreyesdiex.github.io/monopoly/

1. Uno crea la sala y pasa el código de 4 letras (o el enlace).
2. Los demás entran con ese código, eligen personaje y el anfitrión inicia la partida.

No hay servidor: el navegador de quien crea la sala corre las reglas y los demás se conectan a él con
[PeerJS](https://peerjs.com/) (WebRTC). Si el anfitrión cierra la pestaña, la partida termina.

## Probar en tu PC

```
npm start   # http://localhost:3005
npm test
```
