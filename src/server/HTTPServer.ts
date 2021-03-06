import * as http from 'http';
import { Url, parse as parseUrl } from 'url';

export type IRequestHandler = (this: HTTPServer, request: http.IncomingMessage, response: http.ServerResponse) => void | Promise<void>;
export type IErrorRequestHandler = (this: HTTPServer, serverError: Error, request: http.IncomingMessage, response: http.ServerResponse) => void | Promise<void>;

/**
 * Base class for an HTTP server.
 */
export default class HTTPServer {
	/**
	 * Creates a new server instance.
	 * @param handle404 A request handler that is called if no handler can be found for a request URL.
	 * @param handle500 A request handler that is called if another request handler throws an error.
	 * @param handleError A function that is called when errors occur that can not be handled using `handle500`.
	 */
	public constructor(
		private handle404: IRequestHandler,
		private handle500: IErrorRequestHandler,
		private handleError: (error: any) => void
	) { /* do nothing */ }


	/**
	 * Converts a URL object to a string as used by `HTTPServer`.
	 * @param url The URL to convert to a string.
	 */
	public static urlToString(url: Url | string): string {
		if (typeof url === 'string') {
			url = parseUrl(url);
		}
		return url.pathname;
	}


	/**
	 * Creates a URL object compatible with `HTTPServer` from a string.
	 */
	public static createURLFromString(url: string): Url {
		return parseUrl(url);
	}


	/**
	 * Checks if the server is listening to a certain address.
	 */
	public isListeningTo(hostname: string, port: number): boolean {
		hostname = hostname.trim();
		return -1 !== this.servers.findIndex(server => {
			const address = server.address();
			if (address.port !== port) {
				return false;
			}
			if (
				hostname === address.address ||
				(hostname === 'localhost' && address.address === '127.0.0.1') ||
				(hostname === '127.0.0.1' && address.address === 'localhost')
			) {
				return true;
			}
			return false;
		});
	}


	/**
	 * Lets the server listen to a certain hostname and port.
	 * @param hostname The hostname to listen to.
	 * @param port The port to listen to.
	 */
	public async listen(hostname: string, port: number): Promise<void> {
		return new Promise<void>(resolve => {
			// create the server
			const server = http.createServer(async (request, response) => {
				// delegate incoming requests
				const handler = this.getHandlerForURL(parseUrl(request.url), true);
				try {
					await handler.call(this, request, response);
				} catch (err) {
					await this.handle500.call(this, err, request, response);
				}
			});
			server.on('error', this.handleError);
			// start the server, resolve the promise when the server was actually started
			server.listen(port, hostname, () => {
				this.servers.push(server);
				resolve();
			});
		});
	}


	/**
	 * Stops listening to all open sockets.
	 */
	public stop(): void {
		this.servers.forEach(server => server.destroy());
	}


	/**
	 * Checks if there's a request handler for a certain URL.
	 * @param url The URL to check.
	 */
	public hasHandlerForURL(url: Url): boolean {
		return typeof this.getHandlerForURL(url, false) === 'function';
	}


	/**
	 * Register a request handler for a certain request URL. Throws an exception if there's already
	 * a request handler for the given URL.
	 * @param url The URL to listen to, for example '/alpha/beta'.
	 * @param handler A function that handles the request.
	 */
	public addHandler(url: Url, handler: IRequestHandler): void {
		if (this.hasHandlerForURL(url)) {
			throw new Error(`can not add request handler: URL '${HTTPServer.urlToString(url)}' already has a handler`);
		}
		this.handlers[HTTPServer.urlToString(url)] = handler;
	}


	/**
	 * Unregister a request handler for a certain request URL. Throws an exception if there's no
	 * request handler for the given URL.
	 * @param url The URL to remove the handler for, for example '/alpha/beta'.
	 */
	public removeHandlerForURL(url: Url): void {
		if (!this.hasHandlerForURL(url)) {
			throw new Error(`can not remove request handler: URL '${HTTPServer.urlToString(url)}' does not have a handler`);
		}
		delete this.handlers[HTTPServer.urlToString(url)];
	}


	/**
	 * Checks if there's a request handler for a certain URL.
	 * @param url The URL to return the handler function for.
	 * @param fallbackTo404 When `true`, the method returns the server's 404 handler if no handler
	 *                      for the given URL is found.
	 */
	public getHandlerForURL(url: Url, fallbackTo404: boolean): IRequestHandler {
		const handler = this.handlers[HTTPServer.urlToString(url)];
		// fallback to 404 handler if allowed and necessary
		if (fallbackTo404 && typeof handler !== 'function') {
			return this.handle404;
		}
		return handler;
	}


	private readonly servers: http.Server[] = [];

	/**
	 * All of the server's request handler functions by URL.
	 */
	private handlers: { [url: string]: IRequestHandler; } = {};
}
