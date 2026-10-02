#!/usr/bin/env ruby
# Serves this folder over HTTPS on port 8443 so iOS exposes the native share
# sheet (navigator.share is https-only).
#
#   ruby serve-https.rb
#
# Certificate + private key live outside the web root in ~/.collector/
# (created with openssl; the public copy for the iPhone is in ./certs/).
require 'webrick'
require 'webrick/https'
require 'openssl'

ROOT     = File.expand_path(__dir__)
CERT_DIR = File.expand_path('~/.collector')
PORT     = (ENV['PORT'] || 8443).to_i

cert = OpenSSL::X509::Certificate.new(File.read(File.join(CERT_DIR, 'collector.crt')))
key  = OpenSSL::PKey::RSA.new(File.read(File.join(CERT_DIR, 'collector.key')))

mime = WEBrick::HTTPUtils::DefaultMimeTypes.merge(
  'webmanifest' => 'application/manifest+json',
  'cer'         => 'application/x-x509-ca-cert',
  'crt'         => 'application/x-x509-ca-cert',
  'js'          => 'text/javascript',
  'mjs'         => 'text/javascript'
)

server = WEBrick::HTTPServer.new(
  Port:           PORT,
  BindAddress:    '0.0.0.0',
  DocumentRoot:   ROOT,
  MimeTypes:      mime,
  SSLEnable:      true,
  SSLCertificate: cert,
  SSLPrivateKey:  key,
  AccessLog:      [],
  Logger:         WEBrick::Log.new(File::NULL)
)

%w[INT TERM].each { |sig| trap(sig) { server.shutdown } }
puts "Collector HTTPS → https://192.168.1.234:#{PORT}/  (Ctrl+C to stop)"
server.start
