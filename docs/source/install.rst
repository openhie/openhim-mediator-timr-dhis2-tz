Installing The Mediator
=======================

**All installation instructions below assumes that the mediator is running under Ubuntu OS**

*nodejs*
The mediator requires nodejs to run, node 16 or above is recommended

.. code-block:: bash

  sudo apt-get install nodejs

*npm*

.. code-block:: bash

  sudo apt-get install npm

You might need to upgrade your node version to the latest stable version
Check installed version

.. code-block:: bash

  node --version

If less than 16 then upgrade with below commands

.. code-block:: bash

  sudo npm install n -g
  sudo n stable

Now time to clone source codes from github, run below command to clone

.. note::

  You need to have git installed to be able to clone the source code

.. code-block:: bash

  git clone https://github.com/openhie/openhim-mediator-timr-dhis2-tz.git

Install mediator dependencies

.. code-block:: bash

  cd openhim-mediator-timr-dhis2-tz
  npm install