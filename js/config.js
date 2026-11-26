/* QR Studio configuration.
 *
 * Dynamic (editable) QR codes are switched OFF while apiBase is empty — the
 * site then works exactly as a static QR generator.
 *
 * To switch them on, deploy the link service in /worker (see worker/README.md)
 * and put its address here, e.g. 'https://go.yourdomain.com'.
 */
window.QR_CONFIG = {
  apiBase: '',
};
